import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { writeAuditLog } from "@/server/audit/log";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

export async function createWorkspace(input: {
  name: string;
}): Promise<{ id: string }> {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) throw new Error("Workspace name is required.");
  const workspace = await prisma.workspace.create({
    data: {
      ownerId: userId,
      name,
      members: { create: { userId, role: WorkspaceRole.OWNER } },
    },
  });
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "workspace.created",
    targetType: "workspace",
    targetId: workspace.id,
    summary: `Created workspace ${name}.`,
    metadata: { name },
  });
  return { id: workspace.id };
}

export async function updateWorkspaceInstructions(input: {
  workspaceId: string;
  instructions: string;
}): Promise<void> {
  const userId = await requireUserId();
  await assertWorkspaceAccess(userId, input.workspaceId, WorkspaceRole.EDITOR);
  await prisma.workspace.update({
    where: { id: input.workspaceId },
    data: { instructions: input.instructions },
  });
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: userId,
    eventType: "workspace.instructions.updated",
    targetType: "workspace",
    targetId: input.workspaceId,
    summary: "Updated workspace instructions.",
    metadata: { length: input.instructions.length },
  });
}
