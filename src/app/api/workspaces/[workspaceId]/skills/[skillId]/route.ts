import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import { runSkill, type BuiltInSkillId, BUILT_IN_SKILLS } from "@/server/skills/registry";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import { workspaceRouteErrorResponse } from "../../../route-errors";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; skillId: string }> }) {
  try {
    const userId = await requireUserId();
    const { workspaceId, skillId } = await context.params;
    if (!(skillId in BUILT_IN_SKILLS)) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR);
    const formData = await request.formData();
    const result = await runSkill({
      userId,
      workspaceId,
      skillId: skillId as BuiltInSkillId,
      prompt: String(formData.get("prompt") ?? ""),
      model: String(formData.get("model") ?? "") || undefined,
      outputPath: String(formData.get("outputPath") ?? "") || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Skill run failed.", 400);
  }
}
