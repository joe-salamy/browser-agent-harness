import { notFound } from "next/navigation";
import { WorkspaceRole } from "@prisma/client";
import { WorkspaceAccessError, assertWorkspaceAccess } from "@/server/workspaces/access";

export async function requireWorkspaceOwner(userId: string, workspaceId: string): Promise<void> {
  try {
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.OWNER);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) notFound();
    throw error;
  }
}
