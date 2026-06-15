import { readFile } from "fs/promises";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runSkill } from "@/server/skills/registry";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

type ParsedArgs = {
  goal?: string;
  goalFile?: string;
  workspaceId?: string;
  workspaceName?: string;
  userEmail?: string;
  model?: string;
  outputPath?: string;
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
      case "--goal":
        args.goal = value;
        break;
      case "--goal-file":
        args.goalFile = value;
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
      case "--output-path":
        args.outputPath = value;
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }
  return args;
}

async function readGoal(args: ParsedArgs): Promise<string> {
  if ((args.goal ? 1 : 0) + (args.goalFile ? 1 : 0) !== 1) throw new Error("Provide exactly one of --goal or --goal-file.");
  const goal = args.goal ?? (await readFile(args.goalFile as string, "utf8"));
  const trimmed = goal.trim();
  if (!trimmed) throw new Error("Goal is required.");
  return trimmed;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const goal = await readGoal(args);
  const resolved = await resolveUserWorkspace(args);
  if (args.dryRun) {
    console.log("Status: DRY_RUN");
    console.log(`Workspace: ${resolved.workspaceId}`);
    console.log(`Goal characters: ${goal.length}`);
    return;
  }
  const result = await runSkill({
    userId: resolved.userId,
    workspaceId: resolved.workspaceId,
    skillId: "core.chain-builder",
    prompt: goal,
    model: args.model,
    outputPath: args.outputPath,
  });
  const manifestPath = result.outputPath ?? "";
  console.log(`Status: ${result.status}`);
  console.log(`Manifest: ${manifestPath || "-"}`);
  console.log(`Output file: ${result.outputFileId ?? "-"}`);
  if (manifestPath) {
    console.log(
      `Run command: ${formatSkillChainCommand({
        "manifest-workspace-path": manifestPath,
        "user-email": resolved.userEmail,
        "workspace-id": resolved.workspaceId,
        input: goal,
      })}`,
    );
  }
  if (result.status === "FAILED" && result.errorMessage) console.log(`Error: ${result.errorMessage}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Skill chain creation failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
