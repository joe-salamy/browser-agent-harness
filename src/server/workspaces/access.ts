import { WorkspaceRole, type Workspace } from "@prisma/client";
import { prisma } from "@/lib/db";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.VIEWER]: 0,
  [WorkspaceRole.EDITOR]: 1,
  [WorkspaceRole.OWNER]: 2,
};

export class WorkspaceAccessError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

export function hasRoleAtLeast(actual: WorkspaceRole, minimumRole: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimumRole];
}

export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string,
  minimumRole: WorkspaceRole,
): Promise<Workspace> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });

  if (!member || !hasRoleAtLeast(member.role, minimumRole)) {
    throw new WorkspaceAccessError();
  }

  return member.workspace;
}
