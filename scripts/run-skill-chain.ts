import { readFile } from "fs/promises";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runSkillChain } from "@/server/skill-chains/runner";
import { type SkillChainManifest, parseSkillChainManifest } from "@/server/skill-chains/types";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

type ParsedArgs = {
  manifest?: string;
  manifestWorkspacePath?: string;
  manifestFileId?: string;
  input?: string;
  inputFile?: string;
  resumeStatePath?: string;
  workspaceId?: string;
  workspaceName?: string;
  userEmail?: string;
  model?: string;
  dryRun: boolean;
};

function shellQuote(value: string): string {
  return process.platform === "win32" ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
}

function formatSkillChainCommand(args: Record<string, string>): string {
  return [
    "npm",
    "run",
    "skill-chain",
    "--",
    ...Object.entries(args).flatMap(([name, value]) => [`--${name}`, shellQuote(value)]),
  ].join(" ");
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
    index += 1;
    switch (arg) {
      case "--manifest":
        args.manifest = value;
        break;
      case "--manifest-workspace-path":
        args.manifestWorkspacePath = value;
        break;
      case "--manifest-file-id":
        args.manifestFileId = value;
        break;
      case "--input":
        args.input = value;
        break;
      case "--input-file":
        args.inputFile = value;
        break;
      case "--resume-state-path":
        args.resumeStatePath = value;
        break;
      case "--workspace-id":
        args.workspaceId = value;
        break;
      case "--workspace-name":
        args.workspaceName = value;
        break;
      case "--user-email":
        args.userEmail = value;
        break;
      case "--model":
        args.model = value;
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }
  return args;
}

async function resolveUserWorkspace(args: ParsedArgs): Promise<{ userId: string; workspaceId: string; userEmail: string }> {
  if (!args.userEmail) throw new Error("--user-email is required.");
  if ((args.workspaceId ? 1 : 0) + (args.workspaceName ? 1 : 0) !== 1) {
    throw new Error("Provide exactly one of --workspace-id or --workspace-name.");
  }
  const user = await prisma.user.findUnique({ where: { email: args.userEmail } });
  if (!user?.email) throw new Error(`User not found: ${args.userEmail}.`);
  const workspace = args.workspaceId
    ? await prisma.workspace.findUnique({ where: { id: args.workspaceId } })
    : await prisma.workspace.findFirst({
        where: { name: args.workspaceName, members: { some: { userId: user.id } } },
        orderBy: { createdAt: "desc" },
      });
  if (!workspace) throw new Error("Workspace not found.");
  await assertWorkspaceAccess(user.id, workspace.id, WorkspaceRole.EDITOR);
  return { userId: user.id, workspaceId: workspace.id, userEmail: user.email };
}

async function readManifest(args: ParsedArgs): Promise<SkillChainManifest | undefined> {
  if (!args.manifest) return undefined;
  return parseSkillChainManifest(JSON.parse(await readFile(args.manifest, "utf8")));
}

async function readInitialInput(args: ParsedArgs): Promise<string | undefined> {
  if ((args.input ? 1 : 0) + (args.inputFile ? 1 : 0) === 0) return undefined;
  if ((args.input ? 1 : 0) + (args.inputFile ? 1 : 0) !== 1) throw new Error("Provide exactly one of --input or --input-file.");
  const input = args.input ?? (await readFile(args.inputFile as string, "utf8"));
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Initial input is required.");
  return trimmed;
}

function validateMode(args: ParsedArgs): void {
  const manifestSources = (args.manifest ? 1 : 0) + (args.manifestWorkspacePath ? 1 : 0) + (args.manifestFileId ? 1 : 0);
  const inputSources = (args.input ? 1 : 0) + (args.inputFile ? 1 : 0);
  if (args.resumeStatePath) {
    if (inputSources > 0) throw new Error("Resume does not accept --input or --input-file.");
    if (manifestSources > 1) throw new Error("Resume accepts at most one manifest source.");
    return;
  }
  if (manifestSources !== 1) throw new Error("New runs require exactly one manifest source.");
  if (inputSources !== 1) throw new Error("New runs require exactly one input source.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  validateMode(args);
  const resolved = await resolveUserWorkspace(args);
  const manifest = await readManifest(args);
  const initialInput = await readInitialInput(args);
  if (args.dryRun) {
    console.log("Status: DRY_RUN");
    console.log(`Workspace: ${resolved.workspaceId}`);
    console.log(`Mode: ${args.resumeStatePath ? "resume" : "new"}`);
    if (manifest) console.log(`Manifest: ${manifest.id}`);
    return;
  }
  const result = await runSkillChain({
    userId: resolved.userId,
    workspaceId: resolved.workspaceId,
    manifest,
    manifestPath: args.manifestWorkspacePath,
    manifestFileId: args.manifestFileId,
    initialInput,
    model: args.model,
    resumeStatePath: args.resumeStatePath,
  });
  console.log(`Run: ${result.runId}`);
  console.log(`Status: ${result.status}`);
  console.log(`State: ${result.statePath}`);
  console.log("Artifacts:");
  for (const step of result.steps) {
    if (step.status === "SUCCEEDED" && step.outputFileId) {
      console.log(`- ${step.id}: ${step.outputPath} (fileId: ${step.outputFileId})`);
    }
  }
  if (result.status === "FAILED" || result.status === "WAITING_FOR_INPUT") {
    if (result.errorMessage) console.log(`Error: ${result.errorMessage}`);
    console.log(
      `Resume command: ${formatSkillChainCommand({
        "resume-state-path": result.statePath,
        "user-email": resolved.userEmail,
        "workspace-id": resolved.workspaceId,
      })}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Skill chain run failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
