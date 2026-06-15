import { z } from "zod";

export const SKILL_CHAIN_MANIFEST_VERSION = 1 as const;
export const SKILL_CHAIN_STATE_VERSION = 1 as const;
export const EXECUTABLE_CHAIN_SKILL_IDS = ["core.research-synthesis"] as const;
export const CHAIN_AUTHORING_SKILL_ID = "core.chain-builder" as const;

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SkillChainStepSchema = z.object({
  id: slugSchema,
  skillId: z.enum(EXECUTABLE_CHAIN_SKILL_IDS),
  prompt: z.string().trim().min(1).max(8000),
  outputPath: z.string().trim().min(1).max(240),
});

export const SkillChainManifestSchema = z.object({
  version: z.literal(SKILL_CHAIN_MANIFEST_VERSION),
  id: slugSchema,
  name: z.string().trim().min(1).max(120),
  steps: z.array(SkillChainStepSchema).min(1).max(20),
});

export type SkillChainManifest = z.infer<typeof SkillChainManifestSchema>;

export type SkillChainStatus = "RUNNING" | "WAITING_FOR_INPUT" | "SUCCEEDED" | "FAILED";
export type SkillChainStepStatus = "PENDING" | "RUNNING" | "WAITING_FOR_INPUT" | "SUCCEEDED" | "FAILED";

export type SkillChainStepState = {
  id: string;
  skillId: (typeof EXECUTABLE_CHAIN_SKILL_IDS)[number];
  prompt: string;
  outputPath: string;
  status: SkillChainStepStatus;
  agentRunId?: string;
  outputFileId?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
};

export type SkillChainState = {
  version: 1;
  runId: string;
  manifestId: string;
  manifestName: string;
  workspaceId: string;
  statePath: string;
  manifestPath: string;
  initialInputPath: string;
  status: SkillChainStatus;
  currentStepIndex: number;
  createdAt: string;
  updatedAt: string;
  steps: SkillChainStepState[];
  errorMessage?: string;
};

export function parseSkillChainManifest(value: unknown): SkillChainManifest {
  const result = SkillChainManifestSchema.safeParse(value);
  if (result.success) return result.data;
  const error = new Error("Invalid skill chain manifest.") as Error & { cause?: unknown };
  error.cause = result.error.issues;
  throw error;
}

export function extractJsonObjectText(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  if (!fenced && !(candidate.startsWith("{") && candidate.endsWith("}"))) {
    throw new Error("Expected a single JSON object.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("Expected a single JSON object.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a single JSON object.");
  }
  return candidate;
}

export function renderSkillChainOutputPath(input: {
  template: string;
  runId: string;
  stepId: string;
  stepIndex: number;
}): string {
  const stepIndex = String(input.stepIndex + 1).padStart(2, "0");
  const outputPath = input.template
    .replaceAll("{{runId}}", input.runId)
    .replaceAll("{{stepId}}", input.stepId)
    .replaceAll("{{stepIndex}}", stepIndex);
  if (outputPath.includes("{{") || outputPath.includes("}}")) {
    throw new Error(`Unsupported template token in outputPath for step ${input.stepId}.`);
  }
  return outputPath;
}
