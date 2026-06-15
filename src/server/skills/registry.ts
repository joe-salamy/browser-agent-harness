import type { AgentRunResult } from "@/server/agents/runtime";
import { minimalAgentRuntime } from "@/server/agents/minimal-runtime";
import { writeAuditLog } from "@/server/audit/log";

export const BUILT_IN_SKILLS = {
  "core.research-synthesis": {
    id: "core.research-synthesis",
    name: "Research Synthesis",
    description: "Synthesizes supported workspace text files into a sourced Markdown summary.",
    requiredPermissions: ["files:read", "files:write", "models:generate"] as const,
  },
} as const;

export type BuiltInSkillId = keyof typeof BUILT_IN_SKILLS;

export async function runSkill(input: {
  userId: string;
  workspaceId: string;
  skillId: "core.research-synthesis";
  prompt?: string;
}): Promise<AgentRunResult> {
  const skill = BUILT_IN_SKILLS[input.skillId];
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "skill.run.started",
    targetType: "skill",
    targetId: input.skillId,
    summary: `Started skill ${skill.name}.`,
    metadata: { skillId: input.skillId },
  });
  const suffix = input.prompt?.trim() ? ` ${input.prompt.trim()}` : "";
  return minimalAgentRuntime.run({
    userId: input.userId,
    workspaceId: input.workspaceId,
    prompt: `Synthesize the readable workspace files into: Summary, Key Findings, Source Notes, and Recommended Next Steps.${suffix}`,
  });
}
