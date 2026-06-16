import { readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { buildSkillChainManifest } from "@/server/skill-chains/builder";
import {
  formatSkillChainCommand,
  resolveUserWorkspace,
} from "./skill-chain-cli";

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

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${arg}.`);
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
  if ((args.goal ? 1 : 0) + (args.goalFile ? 1 : 0) !== 1)
    throw new Error("Provide exactly one of --goal or --goal-file.");
  const goal = args.goal ?? (await readFile(args.goalFile as string, "utf8"));
  const trimmed = goal.trim();
  if (!trimmed) throw new Error("Goal is required.");
  return trimmed;
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
  const result = await buildSkillChainManifest({
    userId: resolved.userId,
    workspaceId: resolved.workspaceId,
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
  if (result.status === "FAILED" && result.errorMessage)
    console.log(`Error: ${result.errorMessage}`);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Skill chain creation failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
