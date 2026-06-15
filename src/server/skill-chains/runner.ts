import crypto from "crypto";
import { WorkspaceRole } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/log";
import { runSkill } from "@/server/skills/registry";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import {
  createWorkspaceFile,
  getWorkspaceFileByPath,
  readWorkspaceTextFile,
  writeWorkspaceTextFile,
} from "@/server/workspaces/files";
import {
  EXECUTABLE_CHAIN_SKILL_IDS,
  SKILL_CHAIN_STATE_VERSION,
  type SkillChainManifest,
  type SkillChainState,
  type SkillChainStatus,
  type SkillChainStepState,
  extractJsonObjectText,
  parseSkillChainManifest,
  renderSkillChainOutputPath,
} from "./types";

export type RunSkillChainInput = {
  userId: string;
  workspaceId: string;
  manifest?: SkillChainManifest;
  manifestFileId?: string;
  manifestPath?: string;
  initialInput?: string;
  model?: string;
  resumeStatePath?: string;
  executeStep?: SkillChainStepExecutor;
};

export type SkillChainRunResult = {
  runId: string;
  status: SkillChainStatus;
  statePath: string;
  manifestPath: string;
  initialInputPath: string;
  currentStepIndex: number;
  steps: SkillChainState["steps"];
  errorMessage?: string;
};

export type SkillChainStepExecutionInput = {
  userId: string;
  workspaceId: string;
  skillId: (typeof EXECUTABLE_CHAIN_SKILL_IDS)[number];
  prompt: string;
  model?: string;
  outputPath: string;
  stepId: string;
  stepIndex: number;
  runId: string;
  previousArtifacts: Array<{ stepId: string; path: string; fileId: string }>;
};

export type SkillChainStepExecutionResult =
  | { status: "SUCCEEDED"; agentRunId?: string; outputFileId: string; outputPath: string }
  | { status: "FAILED"; agentRunId?: string; errorMessage: string }
  | { status: "WAITING_FOR_INPUT"; agentRunId?: string; message: string };

export type SkillChainStepExecutor = (input: SkillChainStepExecutionInput) => Promise<SkillChainStepExecutionResult>;

type ResolvedSetup = { state: SkillChainState; manifest: SkillChainManifest; resumed: boolean };

type UnknownRecord = Record<string, unknown>;

function parseManifestText(text: string): SkillChainManifest {
  return parseSkillChainManifest(JSON.parse(extractJsonObjectText(text)));
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid skill chain state: ${field}.`);
  return value;
}

function parseSkillChainState(value: unknown): SkillChainState {
  if (!isUnknownRecord(value)) throw new Error("Invalid skill chain state.");
  if (value.version !== SKILL_CHAIN_STATE_VERSION) throw new Error("Invalid skill chain state version.");
  const status = value.status;
  if (status !== "RUNNING" && status !== "WAITING_FOR_INPUT" && status !== "SUCCEEDED" && status !== "FAILED") {
    throw new Error("Invalid skill chain state status.");
  }
  const stepsValue = value.steps;
  if (!Array.isArray(stepsValue)) throw new Error("Invalid skill chain state steps.");
  const steps: SkillChainStepState[] = stepsValue.map((stepValue) => {
    if (!isUnknownRecord(stepValue)) throw new Error("Invalid skill chain step state.");
    const stepStatus = stepValue.status;
    if (
      stepStatus !== "PENDING" &&
      stepStatus !== "RUNNING" &&
      stepStatus !== "WAITING_FOR_INPUT" &&
      stepStatus !== "SUCCEEDED" &&
      stepStatus !== "FAILED"
    ) {
      throw new Error("Invalid skill chain step state status.");
    }
    const skillId = requireString(stepValue.skillId, "steps.skillId");
    if (!EXECUTABLE_CHAIN_SKILL_IDS.includes(skillId as (typeof EXECUTABLE_CHAIN_SKILL_IDS)[number])) {
      throw new Error("Invalid skill chain step skill id.");
    }
    return {
      id: requireString(stepValue.id, "steps.id"),
      skillId: skillId as (typeof EXECUTABLE_CHAIN_SKILL_IDS)[number],
      prompt: requireString(stepValue.prompt, "steps.prompt"),
      outputPath: requireString(stepValue.outputPath, "steps.outputPath"),
      status: stepStatus,
      agentRunId: typeof stepValue.agentRunId === "string" ? stepValue.agentRunId : undefined,
      outputFileId: typeof stepValue.outputFileId === "string" ? stepValue.outputFileId : undefined,
      startedAt: typeof stepValue.startedAt === "string" ? stepValue.startedAt : undefined,
      completedAt: typeof stepValue.completedAt === "string" ? stepValue.completedAt : undefined,
      errorMessage: typeof stepValue.errorMessage === "string" ? stepValue.errorMessage : undefined,
    };
  });
  if (steps.length === 0) throw new Error("Invalid skill chain state steps.");
  const currentStepIndex =
    typeof value.currentStepIndex === "number" && Number.isInteger(value.currentStepIndex) ? value.currentStepIndex : 0;
  if (currentStepIndex < 0 || currentStepIndex > steps.length || (status !== "SUCCEEDED" && currentStepIndex === steps.length)) {
    throw new Error("Invalid skill chain state current step index.");
  }
  return {
    version: SKILL_CHAIN_STATE_VERSION,
    runId: requireString(value.runId, "runId"),
    manifestId: requireString(value.manifestId, "manifestId"),
    manifestName: requireString(value.manifestName, "manifestName"),
    workspaceId: requireString(value.workspaceId, "workspaceId"),
    statePath: requireString(value.statePath, "statePath"),
    manifestPath: requireString(value.manifestPath, "manifestPath"),
    initialInputPath: requireString(value.initialInputPath, "initialInputPath"),
    status,
    currentStepIndex,
    createdAt: requireString(value.createdAt, "createdAt"),
    updatedAt: requireString(value.updatedAt, "updatedAt"),
    steps,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : undefined,
  };
}

function toResult(state: SkillChainState): SkillChainRunResult {
  return {
    runId: state.runId,
    status: state.status,
    statePath: state.statePath,
    manifestPath: state.manifestPath,
    initialInputPath: state.initialInputPath,
    currentStepIndex: state.currentStepIndex,
    steps: state.steps,
    errorMessage: state.errorMessage,
  };
}

function countManifestSources(input: RunSkillChainInput): number {
  return (input.manifest ? 1 : 0) + (input.manifestFileId ? 1 : 0) + (input.manifestPath ? 1 : 0);
}

async function loadManifestFromInput(input: RunSkillChainInput): Promise<{ manifest: SkillChainManifest; sourcePath?: string }> {
  if (input.manifest) return { manifest: parseSkillChainManifest(input.manifest) };
  if (input.manifestFileId) {
    const { file, text } = await readWorkspaceTextFile(input.userId, input.workspaceId, input.manifestFileId);
    return { manifest: parseManifestText(text), sourcePath: file.path };
  }
  if (input.manifestPath) {
    const file = await getWorkspaceFileByPath(input.userId, input.workspaceId, input.manifestPath);
    if (!file) throw new Error(`Skill chain manifest file not found: ${input.manifestPath}.`);
    const { text } = await readWorkspaceTextFile(input.userId, input.workspaceId, file.id);
    return { manifest: parseManifestText(text), sourcePath: file.path };
  }
  throw new Error("Skill chain manifest is required.");
}

function renderStepPrompt(input: {
  prompt: string;
  initialInputPath: string;
  previousArtifacts: Array<{ stepId: string; path: string; fileId: string }>;
}): string {
  const artifacts = input.previousArtifacts.length
    ? input.previousArtifacts.map((artifact) => `- ${artifact.stepId}: ${artifact.path} (fileId: ${artifact.fileId})`).join("\n")
    : "- None";
  return `${input.prompt}\n\nSkill chain context:\nInitial input file: ${input.initialInputPath}\nPrevious artifacts:\n${artifacts}\n\nUse only workspace files and prior artifacts available in this workspace. Preserve filename citations when making claims.`;
}

async function defaultExecuteStep(input: SkillChainStepExecutionInput): Promise<SkillChainStepExecutionResult> {
  const result = await runSkill({
    userId: input.userId,
    workspaceId: input.workspaceId,
    skillId: input.skillId,
    prompt: input.prompt,
    model: input.model,
    outputPath: input.outputPath,
  });
  if (result.status === "SUCCEEDED" && result.outputFileId && result.outputPath) {
    return { status: "SUCCEEDED", agentRunId: result.runId, outputFileId: result.outputFileId, outputPath: result.outputPath };
  }
  return { status: "FAILED", agentRunId: result.runId, errorMessage: result.errorMessage ?? "Skill chain step failed." };
}

async function persistState(input: { userId: string; workspaceId: string; state: SkillChainState }): Promise<void> {
  input.state.updatedAt = new Date().toISOString();
  const text = `${JSON.stringify(input.state, null, 2)}\n`;
  const file = await getWorkspaceFileByPath(input.userId, input.workspaceId, input.state.statePath);
  if (!file) throw new Error(`Skill chain state file not found: ${input.state.statePath}.`);
  await writeWorkspaceTextFile({
    userId: input.userId,
    workspaceId: input.workspaceId,
    fileId: file.id,
    text,
    contentType: "application/json",
  });
}

async function precheckMissing(input: { userId: string; workspaceId: string; paths: string[] }): Promise<void> {
  const seen = new Set<string>();
  for (const path of input.paths) {
    if (seen.has(path)) throw new Error(`Duplicate skill chain artifact path: ${path}.`);
    seen.add(path);
    const existing = await getWorkspaceFileByPath(input.userId, input.workspaceId, path);
    if (existing) throw new Error(`Skill chain artifact already exists: ${path}.`);
  }
}

function renderManifestOutputPaths(manifest: SkillChainManifest, runId: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < manifest.steps.length; index += 1) {
    const step = manifest.steps[index];
    const outputPath = renderSkillChainOutputPath({
      template: step.outputPath,
      runId,
      stepId: step.id,
      stepIndex: index,
    });
    if (seen.has(outputPath)) {
      throw new Error(`Duplicate skill chain output path: ${outputPath}.`);
    }
    seen.add(outputPath);
    paths.push(outputPath);
  }
  return paths;
}

function makeInitialState(input: {
  manifest: SkillChainManifest;
  workspaceId: string;
  runId: string;
  statePath: string;
  manifestPath: string;
  initialInputPath: string;
  now: string;
}): SkillChainState {
  return {
    version: SKILL_CHAIN_STATE_VERSION,
    runId: input.runId,
    manifestId: input.manifest.id,
    manifestName: input.manifest.name,
    workspaceId: input.workspaceId,
    statePath: input.statePath,
    manifestPath: input.manifestPath,
    initialInputPath: input.initialInputPath,
    status: "RUNNING",
    currentStepIndex: 0,
    createdAt: input.now,
    updatedAt: input.now,
    steps: input.manifest.steps.map((step) => ({
      id: step.id,
      skillId: step.skillId,
      prompt: step.prompt,
      outputPath: step.outputPath,
      status: "PENDING",
    })),
  };
}

async function setupNewRun(input: RunSkillChainInput): Promise<ResolvedSetup> {
  if (countManifestSources(input) !== 1) throw new Error("Exactly one skill chain manifest source is required.");
  const initialInput = input.initialInput?.trim();
  if (!initialInput) throw new Error("Initial input is required.");
  const { manifest } = await loadManifestFromInput(input);
  const runId = `${manifest.id}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const statePath = `chains/${manifest.id}/${runId}/chain-state.json`;
  const manifestPath = `chains/${manifest.id}/${runId}/chain-manifest.json`;
  const initialInputPath = `chains/${manifest.id}/${runId}/initial-input.md`;
  const outputPaths = renderManifestOutputPaths(manifest, runId);
  await precheckMissing({
    userId: input.userId,
    workspaceId: input.workspaceId,
    paths: [statePath, manifestPath, initialInputPath, ...outputPaths],
  });
  await createWorkspaceFile({
    userId: input.userId,
    workspaceId: input.workspaceId,
    path: manifestPath,
    bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    contentType: "application/json",
  });
  await createWorkspaceFile({
    userId: input.userId,
    workspaceId: input.workspaceId,
    path: initialInputPath,
    bytes: Buffer.from(`${initialInput}\n`, "utf8"),
    contentType: "text/markdown",
  });
  const now = new Date().toISOString();
  const state = makeInitialState({ manifest, workspaceId: input.workspaceId, runId, statePath, manifestPath, initialInputPath, now });
  await createWorkspaceFile({
    userId: input.userId,
    workspaceId: input.workspaceId,
    path: statePath,
    bytes: Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8"),
    contentType: "application/json",
  });
  return { state, manifest, resumed: false };
}

async function setupResume(input: RunSkillChainInput): Promise<ResolvedSetup> {
  const resumeStatePath = input.resumeStatePath?.trim();
  if (!resumeStatePath) throw new Error("Skill chain state file path is required for resume.");
  const stateFile = await getWorkspaceFileByPath(input.userId, input.workspaceId, resumeStatePath);
  if (!stateFile) throw new Error(`Skill chain state file not found: ${resumeStatePath}.`);
  const { text: stateText } = await readWorkspaceTextFile(input.userId, input.workspaceId, stateFile.id);
  const state = parseSkillChainState(JSON.parse(stateText));
  if (state.workspaceId !== input.workspaceId) throw new Error("Skill chain state belongs to a different workspace.");
  if (state.status === "SUCCEEDED") return { state, manifest: await loadCopiedManifest(input, state), resumed: true };
  if (state.status === "RUNNING") throw new Error("Skill chain is already running; refusing unsafe resume.");
  const manifest = await loadCopiedManifest(input, state);
  if (countManifestSources(input) > 0) {
    const callerManifest = await loadManifestFromInput(input);
    if (callerManifest.manifest.id !== manifest.id) throw new Error("Resume manifest does not match chain state.");
  }
  const resumeIndex = Math.min(state.currentStepIndex, Math.max(state.steps.length - 1, 0));
  for (let index = resumeIndex; index < state.steps.length; index += 1) {
    const manifestStep = manifest.steps[index];
    state.steps[index] = {
      id: manifestStep.id,
      skillId: manifestStep.skillId,
      prompt: manifestStep.prompt,
      outputPath: manifestStep.outputPath,
      status: "PENDING",
    };
  }
  state.status = "RUNNING";
  state.errorMessage = undefined;
  state.currentStepIndex = resumeIndex;
  await persistState({ userId: input.userId, workspaceId: input.workspaceId, state });
  return { state, manifest, resumed: true };
}

async function loadCopiedManifest(input: RunSkillChainInput, state: SkillChainState): Promise<SkillChainManifest> {
  const manifestFile = await getWorkspaceFileByPath(input.userId, input.workspaceId, state.manifestPath);
  if (!manifestFile) throw new Error(`Skill chain manifest file not found: ${state.manifestPath}.`);
  const { text } = await readWorkspaceTextFile(input.userId, input.workspaceId, manifestFile.id);
  const manifest = parseManifestText(text);
  if (manifest.id !== state.manifestId) throw new Error("Skill chain state manifest mismatch.");
  return manifest;
}

async function auditChain(input: {
  userId: string;
  workspaceId: string;
  runId: string;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown>;
  agentRunId?: string;
}): Promise<void> {
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    agentRunId: input.agentRunId,
    eventType: input.eventType,
    targetType: "skillChain",
    targetId: input.runId,
    summary: input.summary,
    metadata: input.metadata,
  });
}

export async function runSkillChain(input: RunSkillChainInput): Promise<SkillChainRunResult> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.EDITOR);
  const setup = input.resumeStatePath ? await setupResume(input) : await setupNewRun(input);
  const state = setup.state;
  if (state.status === "SUCCEEDED") return toResult(state);
  await auditChain({
    userId: input.userId,
    workspaceId: input.workspaceId,
    runId: state.runId,
    eventType: setup.resumed ? "skill.chain.resumed" : "skill.chain.started",
    summary: setup.resumed ? "Resumed skill chain." : "Started skill chain.",
    metadata: { manifestId: state.manifestId, statePath: state.statePath },
  });

  const executeStep = input.executeStep ?? defaultExecuteStep;
  for (let index = state.currentStepIndex; index < state.steps.length; index += 1) {
    const step = state.steps[index];
    step.status = "RUNNING";
    step.startedAt = new Date().toISOString();
    step.completedAt = undefined;
    step.errorMessage = undefined;
    state.status = "RUNNING";
    state.errorMessage = undefined;
    state.currentStepIndex = index;
    await persistState({ userId: input.userId, workspaceId: input.workspaceId, state });
    await auditChain({
      userId: input.userId,
      workspaceId: input.workspaceId,
      runId: state.runId,
      eventType: "skill.chain.step.started",
      summary: `Started skill chain step ${step.id}.`,
      metadata: { manifestId: state.manifestId, statePath: state.statePath, stepId: step.id, skillId: step.skillId },
    });

    let stepResult: SkillChainStepExecutionResult;
    try {
      const outputPath = renderSkillChainOutputPath({
        template: setup.manifest.steps[index].outputPath,
        runId: state.runId,
        stepId: step.id,
        stepIndex: index,
      });
      step.outputPath = outputPath;
      const previousArtifacts = state.steps.slice(0, index).flatMap((candidate) =>
        candidate.status === "SUCCEEDED" && candidate.outputFileId
          ? [{ stepId: candidate.id, path: candidate.outputPath, fileId: candidate.outputFileId }]
          : [],
      );
      stepResult = await executeStep({
        userId: input.userId,
        workspaceId: input.workspaceId,
        skillId: step.skillId,
        prompt: renderStepPrompt({ prompt: step.prompt, initialInputPath: state.initialInputPath, previousArtifacts }),
        model: input.model,
        outputPath,
        stepId: step.id,
        stepIndex: index,
        runId: state.runId,
        previousArtifacts,
      });
    } catch (error) {
      stepResult = { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Skill chain step failed." };
    }

    if (stepResult.status === "SUCCEEDED") {
      if (!stepResult.outputFileId || !stepResult.outputPath) {
        stepResult = { status: "FAILED", agentRunId: stepResult.agentRunId, errorMessage: "Skill chain step did not create an output file." };
      } else {
        step.status = "SUCCEEDED";
        step.agentRunId = stepResult.agentRunId;
        step.outputFileId = stepResult.outputFileId;
        step.outputPath = stepResult.outputPath;
        step.completedAt = new Date().toISOString();
        await persistState({ userId: input.userId, workspaceId: input.workspaceId, state });
        await auditChain({
          userId: input.userId,
          workspaceId: input.workspaceId,
          runId: state.runId,
          agentRunId: stepResult.agentRunId,
          eventType: "skill.chain.step.succeeded",
          summary: `Skill chain step ${step.id} succeeded.`,
          metadata: {
            manifestId: state.manifestId,
            statePath: state.statePath,
            stepId: step.id,
            skillId: step.skillId,
            outputPath: step.outputPath,
            outputFileId: step.outputFileId,
          },
        });
        continue;
      }
    }

    if (stepResult.status === "WAITING_FOR_INPUT") {
      step.status = "WAITING_FOR_INPUT";
      step.agentRunId = stepResult.agentRunId;
      step.errorMessage = stepResult.message;
      state.status = "WAITING_FOR_INPUT";
      state.errorMessage = stepResult.message;
      await persistState({ userId: input.userId, workspaceId: input.workspaceId, state });
      await auditChain({
        userId: input.userId,
        workspaceId: input.workspaceId,
        runId: state.runId,
        agentRunId: stepResult.agentRunId,
        eventType: "skill.chain.waiting_for_input",
        summary: `Skill chain step ${step.id} is waiting for input.`,
        metadata: { manifestId: state.manifestId, statePath: state.statePath, stepId: step.id, skillId: step.skillId },
      });
      return toResult(state);
    }

    step.status = "FAILED";
    step.agentRunId = stepResult.agentRunId;
    step.errorMessage = stepResult.errorMessage;
    state.status = "FAILED";
    state.errorMessage = stepResult.errorMessage;
    await persistState({ userId: input.userId, workspaceId: input.workspaceId, state });
    await auditChain({
      userId: input.userId,
      workspaceId: input.workspaceId,
      runId: state.runId,
      agentRunId: stepResult.agentRunId,
      eventType: "skill.chain.step.failed",
      summary: `Skill chain step ${step.id} failed.`,
      metadata: { manifestId: state.manifestId, statePath: state.statePath, stepId: step.id, skillId: step.skillId },
    });
    await auditChain({
      userId: input.userId,
      workspaceId: input.workspaceId,
      runId: state.runId,
      eventType: "skill.chain.failed",
      summary: "Skill chain failed.",
      metadata: { manifestId: state.manifestId, statePath: state.statePath, stepId: step.id, skillId: step.skillId },
    });
    return toResult(state);
  }

  state.status = "SUCCEEDED";
  state.currentStepIndex = state.steps.length;
  await persistState({ userId: input.userId, workspaceId: input.workspaceId, state });
  await auditChain({
    userId: input.userId,
    workspaceId: input.workspaceId,
    runId: state.runId,
    eventType: "skill.chain.succeeded",
    summary: "Skill chain succeeded.",
    metadata: { manifestId: state.manifestId, statePath: state.statePath },
  });
  return toResult(state);
}
