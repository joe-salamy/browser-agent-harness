import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import { listAvailableSkills } from "@/server/skills/registry";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import { workspaceRouteErrorResponse } from "../../route-errors";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
    const skills = await listAvailableSkills({ userId, workspaceId });
    return NextResponse.json({ skills });
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Skills list failed.", 400);
  }
}
