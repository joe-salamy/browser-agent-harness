import fs from "fs/promises";
import path from "path";
import { parseDocument } from "yaml";
import {
  getWorkspaceFileByPath,
  isCoreReadableText,
  listWorkspaceFiles,
  normalizeWorkspacePath,
  readWorkspaceTextFileCapped,
  type WorkspaceFileWithCurrentVersion,
} from "@/server/workspaces/files";

export type SkillSource = "server" | "workspace";

export type SkillSummary = {
  id: string;
  name: string;
  source: SkillSource;
  description: string;
  hasEntrypoint: boolean;
  referenceCount: number;
  scriptCount: number;
  requiredPermissions: readonly string[];
};

export type SkillAsset = {
  path: string;
  contentType: string;
  text: string;
  truncated: boolean;
};

export type LoadedDirectorySkill = SkillSummary & {
  instructions: string;
  references: SkillAsset[];
  scripts: SkillAsset[];
  entrypoint?: string;
  skillMarkdown: string;
};

export const MAX_SKILL_INSTRUCTIONS_CHARS = 40_000;
export const MAX_SKILL_REFERENCE_TOTAL_CHARS = 80_000;
const MAX_SKILL_MARKDOWN_CHARS = MAX_SKILL_INSTRUCTIONS_CHARS + 4096;
export const MAX_SKILL_ASSET_CHARS = 20_000;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_ID_PATTERN = /^(workspace|server)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_MARKDOWN = "SKILL.md";
const SKILL_REQUIRED_PERMISSIONS = [
  "files:read",
  "files:write",
  "models:generate",
] as const;
const SERVER_ROOT_ENV = "BROWSER_AGENT_SKILL_ROOTS";
const TEXT_CONTENT_TYPE = "text/plain";
const MARKDOWN_CONTENT_TYPE = "text/markdown";
const JS_CONTENT_TYPE = "text/javascript";
const SHELL_CONTENT_TYPE = "text/x-shellscript";
const PYTHON_CONTENT_TYPE = "text/x-python";

type ParsedSkillDocument = {
  name: string;
  description: string;
  instructions: string;
  entrypoint?: string;
};

type ServerSkillRoot = {
  displayRoot: string;
  absoluteRoot: string;
};

type WorkspaceSkillCandidate = {
  name: string;
  skillPath: string;
  file: WorkspaceFileWithCurrentVersion;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateText(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

function normalizeEntrypoint(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Invalid skill entrypoint.");
  const normalized = path.posix.normalize(value.trim().replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.split("/").includes("..") ||
    !normalized.startsWith("scripts/")
  ) {
    throw new Error("Invalid skill entrypoint.");
  }
  const extension = path.posix.extname(normalized);
  if (extension !== ".js" && extension !== ".sh" && extension !== ".py") {
    throw new Error("Invalid skill entrypoint.");
  }
  return normalized;
}

function parseSkillDocument(markdown: string): ParsedSkillDocument {
  if (!markdown.startsWith("---")) throw new Error("Skill frontmatter is required.");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown);
  if (!match) throw new Error("Skill frontmatter is required.");
  const frontmatter = parseDocument(match[1]).toJSON();
  if (!isRecord(frontmatter)) throw new Error("Invalid skill frontmatter.");
  const name = frontmatter.name;
  if (typeof name !== "string" || !SKILL_NAME_PATTERN.test(name)) {
    throw new Error("Invalid skill name.");
  }
  const rawDescription = frontmatter.description;
  if (typeof rawDescription !== "string") {
    throw new Error("Skill description is required.");
  }
  const description = rawDescription.trim();
  if (!description || description.length > 1024) {
    throw new Error("Skill description is required.");
  }
  const instructions = truncateText(match[2] ?? "", MAX_SKILL_INSTRUCTIONS_CHARS).text;
  return {
    name,
    description,
    instructions,
    entrypoint: normalizeEntrypoint(frontmatter.entrypoint),
  };
}

function sourceFromSkillId(skillId: string): "workspace" | "server" | null {
  if (skillId.startsWith("workspace.")) return "workspace";
  if (skillId.startsWith("server.")) return "server";
  return null;
}

function nameFromSkillId(skillId: string): string | null {
  if (!SKILL_ID_PATTERN.test(skillId)) return null;
  return skillId.slice(skillId.indexOf(".") + 1);
}

export function isValidSkillId(skillId: string): boolean {
  return SKILL_ID_PATTERN.test(skillId);
}

function summaryFromParsed(
  source: "workspace" | "server",
  parsed: ParsedSkillDocument,
  referenceCount: number,
  scriptCount: number,
): SkillSummary {
  return {
    id: `${source}.${parsed.name}`,
    name: parsed.name,
    source,
    description: parsed.description,
    hasEntrypoint: parsed.entrypoint !== undefined,
    referenceCount,
    scriptCount,
    requiredPermissions: SKILL_REQUIRED_PERMISSIONS,
  };
}

function contentTypeForPath(assetPath: string): string {
  switch (path.posix.extname(assetPath).toLowerCase()) {
    case ".md":
      return MARKDOWN_CONTENT_TYPE;
    case ".js":
      return JS_CONTENT_TYPE;
    case ".sh":
      return SHELL_CONTENT_TYPE;
    case ".py":
      return PYTHON_CONTENT_TYPE;
    case ".json":
      return "application/json";
    default:
      return TEXT_CONTENT_TYPE;
  }
}

function isWorkspaceSkillPath(pathValue: string): boolean {
  const segments = pathValue.split("/");
  return segments.length === 3 && segments[0] === "skills" && segments[2] === SKILL_MARKDOWN;
}

function workspaceSkillNameFromPath(pathValue: string): string | null {
  if (!isWorkspaceSkillPath(pathValue)) return null;
  const name = pathValue.split("/")[1];
  return SKILL_NAME_PATTERN.test(name) ? name : null;
}

function isWorkspaceAssetForSkill(pathValue: string, skillName: string): boolean {
  return (
    pathValue.startsWith(`skills/${skillName}/references/`) ||
    pathValue.startsWith(`skills/${skillName}/scripts/`)
  );
}

function toSkillRelativeWorkspaceAssetPath(
  pathValue: string,
  skillName: string,
): string {
  return pathValue.slice(`skills/${skillName}/`.length);
}

async function readWorkspaceSkillMarkdown(input: {
  userId: string;
  workspaceId: string;
  file: WorkspaceFileWithCurrentVersion;
}): Promise<string | null> {
  if (!input.file.currentVersion) return null;
  if (!isCoreReadableText(input.file.path, input.file.contentType)) return null;
  const { text } = await readWorkspaceTextFileCapped(
    input.userId,
    input.workspaceId,
    input.file.id,
    MAX_SKILL_MARKDOWN_CHARS,
  );
  return text;
}

async function loadWorkspaceAsset(input: {
  userId: string;
  workspaceId: string;
  file: WorkspaceFileWithCurrentVersion;
  skillName: string;
  remainingReferenceChars: number;
}): Promise<{ asset: SkillAsset | null; consumedReferenceChars: number }> {
  if (!input.file.currentVersion) return { asset: null, consumedReferenceChars: 0 };
  if (!isCoreReadableText(input.file.path, input.file.contentType)) {
    return { asset: null, consumedReferenceChars: 0 };
  }
  const relativePath = toSkillRelativeWorkspaceAssetPath(
    input.file.path,
    input.skillName,
  );
  const maxChars = relativePath.startsWith("references/")
    ? Math.max(0, Math.min(MAX_SKILL_ASSET_CHARS, input.remainingReferenceChars))
    : MAX_SKILL_ASSET_CHARS;
  const { text, truncated: readTruncated } = await readWorkspaceTextFileCapped(
    input.userId,
    input.workspaceId,
    input.file.id,
    maxChars,
  );
  const truncated = truncateText(text, maxChars);
  const hitTotalCap = relativePath.startsWith("references/") && readTruncated;
  return {
    asset: {
      path: relativePath,
      contentType: input.file.contentType,
      text: truncated.text,
      truncated: truncated.truncated || hitTotalCap,
    },
    consumedReferenceChars: relativePath.startsWith("references/")
      ? truncated.text.length
      : 0,
  };
}

async function discoverWorkspaceCandidates(input: {
  userId: string;
  workspaceId: string;
}): Promise<WorkspaceSkillCandidate[]> {
  const files = await listWorkspaceFiles(input.userId, input.workspaceId);
  const candidates: WorkspaceSkillCandidate[] = [];
  for (const file of files) {
    const name = workspaceSkillNameFromPath(file.path);
    if (!name) continue;
    candidates.push({ name, skillPath: file.path, file });
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadWorkspaceSkillByName(input: {
  userId: string;
  workspaceId: string;
  name: string;
}): Promise<LoadedDirectorySkill | null> {
  const skillPath = normalizeWorkspacePath(`skills/${input.name}/${SKILL_MARKDOWN}`);
  const file = await getWorkspaceFileByPath(input.userId, input.workspaceId, skillPath);
  if (!file) return null;
  const markdown = await readWorkspaceSkillMarkdown({ ...input, file });
  if (markdown === null) return null;
  const parsed = parseSkillDocument(markdown);
  if (parsed.name !== input.name) throw new Error("Skill name does not match directory.");
  const allFiles = await listWorkspaceFiles(input.userId, input.workspaceId);
  let remainingReferenceChars = MAX_SKILL_REFERENCE_TOTAL_CHARS;
  const references: SkillAsset[] = [];
  const scripts: SkillAsset[] = [];
  for (const assetFile of allFiles) {
    if (!isWorkspaceAssetForSkill(assetFile.path, input.name)) continue;
    const loaded = await loadWorkspaceAsset({
      userId: input.userId,
      workspaceId: input.workspaceId,
      file: assetFile,
      skillName: input.name,
      remainingReferenceChars,
    });
    if (!loaded.asset) continue;
    if (loaded.asset.path.startsWith("references/")) {
      remainingReferenceChars -= loaded.consumedReferenceChars;
      references.push(loaded.asset);
    } else if (loaded.asset.path.startsWith("scripts/")) {
      scripts.push(loaded.asset);
    }
  }
  references.sort((a, b) => a.path.localeCompare(b.path));
  scripts.sort((a, b) => a.path.localeCompare(b.path));
  return {
    ...summaryFromParsed("workspace", parsed, references.length, scripts.length),
    instructions: parsed.instructions,
    references,
    scripts,
    skillMarkdown: markdown,
    ...(parsed.entrypoint ? { entrypoint: parsed.entrypoint } : {}),
  };
}

function configuredServerRoots(): ServerSkillRoot[] {
  const roots = [
    path.join(process.cwd(), "skills"),
    path.join(process.cwd(), ".agents", "skills"),
  ];
  const envRoots = process.env[SERVER_ROOT_ENV]?.split(path.delimiter) ?? [];
  const seen = new Set<string>();
  const result: ServerSkillRoot[] = [];
  for (const root of roots) {
    const absoluteRoot = path.resolve(root);
    const key = process.platform === "win32" ? absoluteRoot.toLowerCase() : absoluteRoot;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ displayRoot: root, absoluteRoot });
  }
  for (const root of envRoots) {
    const trimmed = root.trim();
    if (!trimmed || !path.isAbsolute(trimmed)) continue;
    const absoluteRoot = path.resolve(trimmed);
    const key = process.platform === "win32" ? absoluteRoot.toLowerCase() : absoluteRoot;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ displayRoot: trimmed, absoluteRoot });
  }
  return result;
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realPathIfExists(pathValue: string): Promise<string | null> {
  try {
    return await fs.realpath(pathValue);
  } catch {
    return null;
  }
}

async function readTextFileCapped(filePath: string, maxChars: number) {
  const cappedChars = Math.max(0, maxChars);
  const file = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(cappedChars + 1);
    const { bytesRead } = await file.read(buffer, 0, cappedChars + 1, 0);
    const truncated = bytesRead > cappedChars;
    const bytes = truncated ? buffer.subarray(0, cappedChars) : buffer.subarray(0, bytesRead);
    return { ...truncateText(bytes.toString("utf8"), cappedChars), truncated };
  } finally {
    await file.close();
  }
}

async function readServerAssets(input: {
  skillDir: string;
  assetDirName: "references" | "scripts";
}): Promise<SkillAsset[]> {
  const assetRoot = path.join(input.skillDir, input.assetDirName);
  const realAssetRoot = await realPathIfExists(assetRoot);
  if (!realAssetRoot || !isPathInside(input.skillDir, realAssetRoot)) return [];
  const safeAssetRoot = realAssetRoot;
  const assets: SkillAsset[] = [];
  let remainingReferenceChars = MAX_SKILL_REFERENCE_TOTAL_CHARS;
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const realEntryPath = await realPathIfExists(absolutePath);
      if (
        !realEntryPath ||
        !isPathInside(safeAssetRoot, realEntryPath) ||
        !isPathInside(input.skillDir, realEntryPath)
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(realEntryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(input.skillDir, realEntryPath).replaceAll(path.sep, "/");
      const maxChars = input.assetDirName === "references"
        ? Math.max(0, Math.min(MAX_SKILL_ASSET_CHARS, remainingReferenceChars))
        : MAX_SKILL_ASSET_CHARS;
      const loaded = await readTextFileCapped(realEntryPath, maxChars);
      if (input.assetDirName === "references") {
        remainingReferenceChars -= loaded.text.length;
      }
      assets.push({
        path: relativePath,
        contentType: contentTypeForPath(relativePath),
        text: loaded.text,
        truncated: loaded.truncated,
      });
    }
  }
  await walk(safeAssetRoot);
  return assets.sort((a, b) => a.path.localeCompare(b.path));
}

async function loadServerSkillFromDirectory(input: {
  root: ServerSkillRoot;
  name: string;
}): Promise<LoadedDirectorySkill | null> {
  const realRoot = await realPathIfExists(input.root.absoluteRoot);
  if (!realRoot) return null;
  const skillDir = path.resolve(realRoot, input.name);
  if (!isPathInside(realRoot, skillDir)) return null;
  const realSkillDir = await realPathIfExists(skillDir);
  if (!realSkillDir || !isPathInside(realRoot, realSkillDir)) return null;
  const skillPath = path.join(realSkillDir, SKILL_MARKDOWN);
  const realSkillPath = await realPathIfExists(skillPath);
  if (!realSkillPath || !isPathInside(realSkillDir, realSkillPath)) return null;
  const markdown = (await readTextFileCapped(
    realSkillPath,
    MAX_SKILL_MARKDOWN_CHARS,
  )).text;
  const parsed = parseSkillDocument(markdown);
  if (parsed.name !== input.name) throw new Error("Skill name does not match directory.");
  const references = await readServerAssets({ skillDir: realSkillDir, assetDirName: "references" });
  const scripts = await readServerAssets({ skillDir: realSkillDir, assetDirName: "scripts" });
  return {
    ...summaryFromParsed("server", parsed, references.length, scripts.length),
    instructions: parsed.instructions,
    references,
    scripts,
    skillMarkdown: markdown,
    ...(parsed.entrypoint ? { entrypoint: parsed.entrypoint } : {}),
  };
}

async function listServerSkillNames(root: ServerSkillRoot): Promise<string[]> {
  try {
    const realRoot = await realPathIfExists(root.absoluteRoot);
    if (!realRoot) return [];
    const entries = await fs.readdir(realRoot, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !SKILL_NAME_PATTERN.test(entry.name)) continue;
      const skillDir = path.join(realRoot, entry.name);
      const realSkillDir = await realPathIfExists(skillDir);
      if (!realSkillDir || !isPathInside(realRoot, realSkillDir)) continue;
      const skillPath = path.join(realSkillDir, SKILL_MARKDOWN);
      const realSkillPath = await realPathIfExists(skillPath);
      if (!realSkillPath || !isPathInside(realSkillDir, realSkillPath)) continue;
      names.push(entry.name);
    }
    return names.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function listWorkspaceSkillSummaries(input: {
  userId: string;
  workspaceId: string;
}): Promise<SkillSummary[]> {
  const candidates = await discoverWorkspaceCandidates(input);
  const summaries: SkillSummary[] = [];
  for (const candidate of candidates) {
    const loaded = await loadWorkspaceSkillByName({ ...input, name: candidate.name });
    if (!loaded) continue;
    summaries.push({
      id: loaded.id,
      name: loaded.name,
      source: loaded.source,
      description: loaded.description,
      hasEntrypoint: loaded.hasEntrypoint,
      referenceCount: loaded.referenceCount,
      scriptCount: loaded.scriptCount,
      requiredPermissions: loaded.requiredPermissions,
    });
  }
  return summaries.sort((a, b) => a.id.localeCompare(b.id));
}

async function listServerSkillSummaries(): Promise<SkillSummary[]> {
  const byId = new Map<string, SkillSummary>();
  for (const root of configuredServerRoots()) {
    const names = await listServerSkillNames(root);
    for (const name of names) {
      const loaded = await loadServerSkillFromDirectory({ root, name });
      if (!loaded || byId.has(loaded.id)) continue;
      byId.set(loaded.id, {
        id: loaded.id,
        name: loaded.name,
        source: loaded.source,
        description: loaded.description,
        hasEntrypoint: loaded.hasEntrypoint,
        referenceCount: loaded.referenceCount,
        scriptCount: loaded.scriptCount,
        requiredPermissions: loaded.requiredPermissions,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listDirectorySkills(input: {
  userId: string;
  workspaceId: string;
}): Promise<SkillSummary[]> {
  return [
    ...(await listWorkspaceSkillSummaries(input)),
    ...(await listServerSkillSummaries()),
  ];
}

export async function loadDirectorySkill(input: {
  userId: string;
  workspaceId: string;
  skillId: string;
}): Promise<LoadedDirectorySkill | null> {
  if (!SKILL_ID_PATTERN.test(input.skillId)) return null;
  const source = sourceFromSkillId(input.skillId);
  const name = nameFromSkillId(input.skillId);
  if (!source || !name) return null;
  if (source === "workspace") {
    return loadWorkspaceSkillByName({
      userId: input.userId,
      workspaceId: input.workspaceId,
      name,
    });
  }
  for (const root of configuredServerRoots()) {
    const loaded = await loadServerSkillFromDirectory({ root, name });
    if (loaded) return loaded;
  }
  return null;
}
