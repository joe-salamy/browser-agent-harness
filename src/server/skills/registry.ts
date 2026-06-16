import { WorkspaceRole } from "@prisma/client";
import type { AgentRunResult } from "@/server/agents/runtime";
import { buildSkillChainManifest } from "@/server/skill-chains/builder";
import { minimalAgentRuntime } from "@/server/agents/minimal-runtime";
import { runWebSearchGroundingSkill } from "@/server/skills/web-search";
import { writeAuditLog } from "@/server/audit/log";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

export const BUILT_IN_SKILLS = {
  "core.research-synthesis": {
    id: "core.research-synthesis",
    name: "Research Synthesis",
    description: "Synthesizes supported workspace text files into a sourced Markdown summary.",
    requiredPermissions: ["files:read", "files:write", "models:generate"] as const,
  },
  "core.web-search-grounding": {
    id: "core.web-search-grounding",
    name: "Web Search & Grounding",
    description: "Fetches web search context before running the minimal agent.",
    requiredPermissions: ["files:read", "files:write", "models:generate"] as const,
  },
  "core.chain-builder": {
    id: "core.chain-builder",
    name: "Chain Builder",
    description: "Creates validated JSON skill-chain manifests from a user goal.",
    requiredPermissions: ["files:read", "files:write", "models:generate"] as const,
  },
} as const;

export type BuiltInSkillId = keyof typeof BUILT_IN_SKILLS;

function isBuiltInSkillId(skillId: string): skillId is BuiltInSkillId {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_SKILLS, skillId);
}

export async function runSkill(input: {
  userId: string;
  workspaceId: string;
  skillId: string;
  prompt?: string;
  model?: string;
  outputPath?: string;
}): Promise<AgentRunResult> {
  if (!isBuiltInSkillId(input.skillId)) throw new Error("Unknown skill.");
  const skill = BUILT_IN_SKILLS[input.skillId];
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.EDITOR);
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "skill.run.started",
    targetType: "skill",
    targetId: input.skillId,
    summary: `Started skill ${skill.name}.`,
    metadata: { skillId: input.skillId },
  });
  switch (input.skillId) {
    case "core.research-synthesis": {
      const suffix = input.prompt?.trim() ? ` ${input.prompt.trim()}` : "";
      return minimalAgentRuntime.run({
        userId: input.userId,
        workspaceId: input.workspaceId,
        prompt: `Synthesize the readable workspace files into: Summary, Key Findings, Source Notes, and Recommended Next Steps.${suffix}`,
        model: input.model,
        outputPath: input.outputPath,
      });
    }
    case "core.web-search-grounding":
      return runWebSearchGroundingSkill({
        userId: input.userId,
        workspaceId: input.workspaceId,
        prompt: input.prompt,
        model: input.model,
        outputPath: input.outputPath,
      });
    case "core.chain-builder":
      return buildSkillChainManifest({
        userId: input.userId,
        workspaceId: input.workspaceId,
        prompt: input.prompt ?? "",
        model: input.model,
        outputPath: input.outputPath,
      });
  }
}
