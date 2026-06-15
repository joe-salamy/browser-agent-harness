import type { AuditLog, Prisma } from "@prisma/client";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

const SECRET_KEY_PATTERN = /(secret|token|authorization|cookie|password|api[-_]?key|credential)/i;

export function assertAuditMetadataSafe(metadata: unknown, path = "metadata"): void {
  if (metadata == null) return;
  if (typeof metadata !== "object") return;

  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    const nextPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Audit metadata may not include secret field ${nextPath}.`);
    }
    assertAuditMetadataSafe(value, nextPath);
  }
}

export async function writeAuditLog(input: {
  workspaceId: string;
  actorUserId?: string;
  agentRunId?: string;
  eventType: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  metadata?: unknown;
}): Promise<void> {
  assertAuditMetadataSafe(input.metadata);
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      agentRunId: input.agentRunId,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadataJson: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
    },
  });
}

export async function listAuditLogs(userId: string, workspaceId: string): Promise<AuditLog[]> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  return prisma.auditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
