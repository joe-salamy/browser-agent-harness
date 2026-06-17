import { readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { runSkillChain } from "@/server/skill-chains/runner";
import {
  type SkillChainManifest,
  parseSkillChainManifest,
} from "@/server/skill-chains/types";
import {
  formatSkillChainCommand,
  resolveUserWorkspace,
} from "./skill-chain-cli";

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
  allowScripts: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { dryRun: false, allowScripts: false };
  const valueArgs = new Set<string>();
  function setValue(
    field: Exclude<keyof ParsedArgs, "dryRun" | "allowScripts">,
    value: string,
  ): void {
    if (valueArgs.has(field)) throw new Error(`Duplicate argument --${field}.`);
    valueArgs.add(field);
    args[field] = value;
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      if (args.dryRun) throw new Error("Duplicate argument --dry-run.");
      args.dryRun = true;
      continue;
    }
    if (arg === "--allow-scripts") {
      if (args.allowScripts)
        throw new Error("Duplicate argument --allow-scripts.");
      args.allowScripts = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${arg}.`);
    index += 1;
    switch (arg) {
      case "--manifest":
        setValue("manifest", value);
        break;
      case "--manifest-workspace-path":
        setValue("manifestWorkspacePath", value);
        break;
      case "--manifest-file-id":
        setValue("manifestFileId", value);
        break;
      case "--input":
        setValue("input", value);
        break;
      case "--input-file":
        setValue("inputFile", value);
        break;
      case "--resume-state-path":
        setValue("resumeStatePath", value);
        break;
      case "--workspace-id":
        setValue("workspaceId", value);
        break;
      case "--workspace-name":
        setValue("workspaceName", value);
        break;
      case "--user-email":
        setValue("userEmail", value);
        break;
      case "--model":
        setValue("model", value);
        break;
      default:
        throw new Error(`Unknown argument ${arg}.`);
    }
  }
  return args;
}

async function readManifest(
  args: ParsedArgs,
): Promise<SkillChainManifest | undefined> {
  if (!args.manifest) return undefined;
  return parseSkillChainManifest(
    JSON.parse(await readFile(args.manifest, "utf8")),
  );
}

async function readInitialInput(args: ParsedArgs): Promise<string | undefined> {
  if ((args.input ? 1 : 0) + (args.inputFile ? 1 : 0) === 0) return undefined;
  if ((args.input ? 1 : 0) + (args.inputFile ? 1 : 0) !== 1)
    throw new Error("Provide exactly one of --input or --input-file.");
  const input =
    args.input ?? (await readFile(args.inputFile as string, "utf8"));
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Initial input is required.");
  return trimmed;
}

function validateMode(args: ParsedArgs): void {
  const manifestSources =
    (args.manifest ? 1 : 0) +
    (args.manifestWorkspacePath ? 1 : 0) +
    (args.manifestFileId ? 1 : 0);
  const inputSources = (args.input ? 1 : 0) + (args.inputFile ? 1 : 0);
  if (args.resumeStatePath) {
    if (inputSources > 0)
      throw new Error("Resume does not accept --input or --input-file.");
    if (manifestSources > 1)
      throw new Error("Resume accepts at most one manifest source.");
    return;
  }
  if (manifestSources !== 1)
    throw new Error("New runs require exactly one manifest source.");
  if (inputSources !== 1)
    throw new Error("New runs require exactly one input source.");
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
    if (args.allowScripts) console.log("Scripts: enabled");
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
    allowScripts: args.allowScripts,
  });
  console.log(`Run: ${result.runId}`);
  console.log(`Status: ${result.status}`);
  console.log(`State: ${result.statePath}`);
  console.log("Artifacts:");
  for (const step of result.steps) {
    if (step.status === "SUCCEEDED" && step.outputFileId) {
      console.log(
        `- ${step.id}: ${step.outputPath} (fileId: ${step.outputFileId})`,
      );
    }
  }
  if (result.status === "FAILED" || result.status === "WAITING_FOR_INPUT") {
    if (result.errorMessage) console.log(`Error: ${result.errorMessage}`);
    console.log(
      `Resume command: ${formatSkillChainCommand(
        {
          "resume-state-path": result.statePath,
          "user-email": resolved.userEmail,
          "workspace-id": resolved.workspaceId,
        },
        args.allowScripts ? ["allow-scripts"] : [],
      )}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Skill chain run failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
