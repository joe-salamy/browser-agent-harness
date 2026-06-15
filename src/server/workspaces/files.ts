import crypto from "crypto";
import path from "path";
import { WorkspaceRole, type WorkspaceFile, type WorkspaceFileVersion } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/server/audit/log";
import { getObjectStore } from "@/server/storage";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import { createZip } from "@/server/workspaces/zip";

const TEXT_CONTENT_TYPES: Record<string, true> = {
  "text/plain": true,
  "text/markdown": true,
  "application/json": true,
  "text/csv": true,
};
const TEXT_EXTENSIONS: Record<string, true> = {
  ".txt": true,
  ".md": true,
  ".json": true,
  ".csv": true,
};

export class UnsupportedTextFileError extends Error {
  constructor() {
    super("File type is stored but not readable by core text tools.");
    this.name = "UnsupportedTextFileError";
  }
}

export type WorkspaceFileWithCurrentVersion = WorkspaceFile & { currentVersion: WorkspaceFileVersion | null };

export function normalizeWorkspacePath(inputPath: string): string {
  const raw = inputPath.trim().replaceAll("\\", "/");
  if (raw.length === 0 || raw.length > 512 || raw.includes("\0")) {
    throw new Error("Invalid workspace file path.");
  }
  if (raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) {
    throw new Error("Workspace file path must be relative.");
  }
  if (raw.split("/").includes("..")) {
    throw new Error("Workspace file path cannot traverse directories.");
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized.startsWith("../") || normalized === ".." || normalized.split("/").includes("..")) {
    throw new Error("Workspace file path cannot traverse directories.");
  }
  return normalized;
}

export function isCoreReadableText(pathValue: string, contentType: string): boolean {
  const cleanContentType = contentType.split(";", 1)[0].trim().toLowerCase();
  return TEXT_CONTENT_TYPES[cleanContentType] === true || TEXT_EXTENSIONS[path.posix.extname(pathValue).toLowerCase()] === true;
}

export async function listWorkspaceFiles(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceFileWithCurrentVersion[]> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  return prisma.workspaceFile.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { path: "asc" },
    include: { currentVersion: true },
  });
}

export async function readWorkspaceTextFile(
  userId: string,
  workspaceId: string,
  fileId: string,
): Promise<{ file: WorkspaceFile; text: string }> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, workspaceId, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!file?.currentVersion) throw new Error("File not found.");
  if (!isCoreReadableText(file.path, file.contentType)) {
    await writeAuditLog({
      workspaceId,
      actorUserId: userId,
      eventType: "file.read.unsupported",
      targetType: "file",
      targetId: file.id,
      summary: `Core text tools cannot read ${file.path}.`,
      metadata: { path: file.path, contentType: file.contentType },
    });
    throw new UnsupportedTextFileError();
  }

  const bytes = await getObjectStore().getObject({ key: file.currentVersion.objectKey });
  return { file, text: bytes.toString("utf8") };
}

export async function getWorkspaceFileDownload(
  userId: string,
  workspaceId: string,
  fileId: string,
): Promise<{ file: WorkspaceFile; bytes: Buffer }> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, workspaceId, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!file?.currentVersion) throw new Error("File not found.");
  const bytes = await getObjectStore().getObject({ key: file.currentVersion.objectKey });
  return { file, bytes };
}

export async function createWorkspaceFile(input: {
  userId: string;
  workspaceId: string;
  path: string;
  bytes: Buffer;
  contentType: string;
  createdByRunId?: string;
}): Promise<WorkspaceFile> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.EDITOR);
  const normalizedPath = normalizeWorkspacePath(input.path);
  const existing = await prisma.workspaceFile.findFirst({
    where: { workspaceId: input.workspaceId, path: normalizedPath, deletedAt: null },
    select: { id: true },
  });
  if (existing) throw new Error("A current file already exists at that path.");

  const fileId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const objectKey = `workspaces/${input.workspaceId}/files/${fileId}/versions/${versionId}`;
  const sha256 = crypto.createHash("sha256").update(input.bytes).digest("hex");
  await getObjectStore().putObject({ key: objectKey, body: input.bytes, contentType: input.contentType });

  const file = await prisma.$transaction(async (tx) => {
    await tx.workspaceFile.create({
      data: {
        id: fileId,
        workspaceId: input.workspaceId,
        path: normalizedPath,
        name: path.posix.basename(normalizedPath),
        contentType: input.contentType,
        sizeBytes: input.bytes.length,
        createdById: input.userId,
      },
    });
    await tx.workspaceFileVersion.create({
      data: {
        id: versionId,
        fileId,
        workspaceId: input.workspaceId,
        versionNumber: 1,
        objectKey,
        sha256,
        sizeBytes: input.bytes.length,
        contentType: input.contentType,
        createdById: input.userId,
        createdByRunId: input.createdByRunId,
      },
    });
    return tx.workspaceFile.update({
      where: { id: fileId },
      data: { currentVersionId: versionId },
    });
  });

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    agentRunId: input.createdByRunId,
    eventType: "file.created",
    targetType: "file",
    targetId: file.id,
    summary: `Created ${normalizedPath}.`,
    metadata: { path: normalizedPath, contentType: input.contentType, sizeBytes: input.bytes.length },
  });
  return file;
}

export async function writeWorkspaceTextFile(input: {
  userId: string;
  workspaceId: string;
  fileId: string;
  text: string;
  contentType?: string;
  createdByRunId?: string;
}): Promise<WorkspaceFileVersion> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.EDITOR);
  const file = await prisma.workspaceFile.findFirst({
    where: { id: input.fileId, workspaceId: input.workspaceId, deletedAt: null },
    include: { currentVersion: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!file?.currentVersion) throw new Error("File not found.");
  const contentType = input.contentType ?? file.contentType;
  if (!isCoreReadableText(file.path, contentType)) throw new UnsupportedTextFileError();

  const bytes = Buffer.from(input.text, "utf8");
  const versionId = crypto.randomUUID();
  const versionNumber = (file.versions[0]?.versionNumber ?? 0) + 1;
  const objectKey = `workspaces/${input.workspaceId}/files/${file.id}/versions/${versionId}`;
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  await getObjectStore().putObject({ key: objectKey, body: bytes, contentType });

  const version = await prisma.$transaction(async (tx) => {
    const created = await tx.workspaceFileVersion.create({
      data: {
        id: versionId,
        fileId: file.id,
        workspaceId: input.workspaceId,
        versionNumber,
        objectKey,
        sha256,
        sizeBytes: bytes.length,
        contentType,
        createdById: input.userId,
        createdByRunId: input.createdByRunId,
        previousVersionId: file.currentVersionId,
      },
    });
    await tx.workspaceFile.update({
      where: { id: file.id },
      data: { currentVersionId: versionId, sizeBytes: bytes.length, contentType },
    });
    return created;
  });

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    agentRunId: input.createdByRunId,
    eventType: "file.version.created",
    targetType: "file",
    targetId: file.id,
    summary: `Created version ${versionNumber} for ${file.path}.`,
    metadata: { path: file.path, versionNumber, sizeBytes: bytes.length },
  });
  return version;
}

export async function createWorkspaceExport(
  userId: string,
  workspaceId: string,
): Promise<{ filename: string; bytes: Buffer; contentType: string }> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  const files = await prisma.workspaceFile.findMany({
    where: { workspaceId, deletedAt: null },
    include: { currentVersion: true },
    orderBy: { path: "asc" },
  });
  const entries: Array<{ path: string; bytes: Buffer }> = [];
  for (const file of files) {
    if (file.currentVersion) {
      entries.push({ path: file.path, bytes: await getObjectStore().getObject({ key: file.currentVersion.objectKey }) });
    }
  }
  const logs = await prisma.auditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  entries.push({ path: "audit-log.json", bytes: Buffer.from(JSON.stringify(logs, null, 2), "utf8") });
  const bytes = createZip(entries);

  await writeAuditLog({
    workspaceId,
    actorUserId: userId,
    eventType: "workspace.export.created",
    targetType: "workspace",
    targetId: workspaceId,
    summary: "Created workspace export.",
    metadata: { fileCount: files.length },
  });

  return { filename: `workspace-${workspaceId}.zip`, bytes, contentType: "application/zip" };
}
