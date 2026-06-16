import path from "path";
import { z } from "zod";

export const SKILL_CHAIN_MANIFEST_VERSION = 1 as const;
export const SKILL_CHAIN_STATE_VERSION = 1 as const;
export const skillIdSchema = z
  .string()
  .regex(/^(workspace|server)\.[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const CHAIN_AUTHORING_SKILL_ID = "server.chain-builder" as const;

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE_SEGMENT_PATTERN = /^[A-Za-z]:/;
const OUTPUT_PATH_TOKEN_PATTERN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;
const OUTPUT_PATH_TOKEN_VALUES = {
  runId: "run",
  stepId: "step",
  stepIndex: "01",
} as const;

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function normalizeSkillChainWorkspacePath(inputPath: string): string {
  const raw = inputPath.trim().replaceAll("\\", "/");
  if (raw.length === 0 || raw.length > 512 || CONTROL_CHAR_PATTERN.test(raw)) {
    throw new Error("Skill chain outputPath must be a valid workspace path.");
  }
  if (
    raw.startsWith("/") ||
    raw
      .split("/")
      .some((segment) => WINDOWS_DRIVE_SEGMENT_PATTERN.test(segment))
  ) {
    throw new Error("Skill chain outputPath must be relative.");
  }
  if (raw.split("/").includes("..")) {
    throw new Error("Skill chain outputPath cannot traverse directories.");
  }
  const normalized = path.posix.normalize(raw);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Skill chain outputPath cannot traverse directories.");
  }
  if (!normalized.startsWith("chains/")) {
    throw new Error("Skill chain outputPath must be under chains/.");
  }
  return normalized;
}

function renderOutputPathTemplateForValidation(template: string): string {
  let hasUnsupportedToken = false;
  const rendered = template.replace(
    OUTPUT_PATH_TOKEN_PATTERN,
    (match, token: string) => {
      if (
        Object.prototype.hasOwnProperty.call(OUTPUT_PATH_TOKEN_VALUES, token)
      ) {
        return OUTPUT_PATH_TOKEN_VALUES[
          token as keyof typeof OUTPUT_PATH_TOKEN_VALUES
        ];
      }
      hasUnsupportedToken = true;
      return match;
    },
  );
  if (
    hasUnsupportedToken ||
    rendered.includes("{{") ||
    rendered.includes("}}")
  ) {
    throw new Error("Unsupported template token in outputPath.");
  }
  return rendered;
}

const outputPathTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .superRefine((template, ctx) => {
    try {
      normalizeSkillChainWorkspacePath(
        renderOutputPathTemplateForValidation(template),
      );
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "Invalid skill chain outputPath.",
      });
    }
  });

export const SkillChainStepSchema = z.object({
  id: slugSchema,
  skillId: skillIdSchema,
  prompt: z.string().trim().min(1).max(8000),
  outputPath: outputPathTemplateSchema,
});

export const SkillChainManifestSchema = z
  .object({
    version: z.literal(SKILL_CHAIN_MANIFEST_VERSION),
    id: slugSchema,
    name: z.string().trim().min(1).max(120),
    steps: z.array(SkillChainStepSchema).min(1).max(20),
  })
  .superRefine((manifest, ctx) => {
    const stepIds = new Set<string>();
    manifest.steps.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "id"],
          message: "Duplicate skill chain step id.",
        });
      }
      stepIds.add(step.id);
    });
  });

export type SkillChainManifest = z.infer<typeof SkillChainManifestSchema>;

export type SkillChainStatus =
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "SUCCEEDED"
  | "FAILED";
export type SkillChainStepStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "SUCCEEDED"
  | "FAILED";

export type SkillChainStepState = {
  id: string;
  skillId: string;
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
  const error = new Error("Invalid skill chain manifest.") as Error & {
    cause?: unknown;
  };
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
    .trim()
    .replaceAll("\\", "/")
    .replaceAll("{{runId}}", input.runId)
    .replaceAll("{{stepId}}", input.stepId)
    .replaceAll("{{stepIndex}}", stepIndex);
  if (outputPath.includes("{{") || outputPath.includes("}}")) {
    throw new Error(
      `Unsupported template token in outputPath for step ${input.stepId}.`,
    );
  }
  try {
    return normalizeSkillChainWorkspacePath(outputPath);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Invalid skill chain outputPath.";
    throw new Error(`${message} Step: ${input.stepId}.`);
  }
}
