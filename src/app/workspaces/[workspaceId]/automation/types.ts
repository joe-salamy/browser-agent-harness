import type { AgentRunResult } from "@/server/agents/runtime";
import type { SkillChainRunResult } from "@/server/skill-chains/runner";
import type { SkillChainManifest } from "@/server/skill-chains/types";
import type { SkillSummary } from "@/server/skills/directory";

export type AutomationFileOption = {
  id: string;
  path: string;
  contentType: string;
  sizeBytes: number;
  readableByCore: boolean;
};

export type AutomationSkillOption = SkillSummary;

export type BuildManifestDryRunResult = {
  status: "DRY_RUN";
  workspaceId: string;
  goalCharacters: number;
};

export type BuildManifestResult =
  | BuildManifestDryRunResult
  | (AgentRunResult & {
      outputPath?: string;
      manifestPath?: string;
      manifest?: SkillChainManifest;
    });

export type SkillChainDryRunResult = {
  status: "DRY_RUN";
  workspaceId: string;
  mode: "new" | "resume";
  manifestId?: string;
  scriptsEnabled: boolean;
};

export type SkillChainUiResult = SkillChainDryRunResult | SkillChainRunResult;

export type ManifestSource =
  | "json"
  | "workspacePath"
  | "workspaceFile"
  | "none";

export type RunMode = "new" | "resume";
