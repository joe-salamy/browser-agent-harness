import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import {
  runSkill,
  type BuiltInSkillId,
  BUILT_IN_SKILLS,
} from "@/server/skills/registry";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import { workspaceRouteErrorResponse } from "../../../route-errors";

function isBuiltInSkillId(skillId: string): skillId is BuiltInSkillId {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_SKILLS, skillId);
}

function optionalFormDataString(
  formData: FormData,
  field: string,
): string | undefined {
  const value = formData.get(field);
  if (value === null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid request body.");
  const trimmed = value.trim();
  return trimmed || undefined;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; skillId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId, skillId } = await context.params;
    if (!isBuiltInSkillId(skillId))
      return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR);
    const formData = await request.formData();
    const result = await runSkill({
      userId,
      workspaceId,
      skillId,
      prompt: optionalFormDataString(formData, "prompt") ?? "",
      model: optionalFormDataString(formData, "model"),
      outputPath: optionalFormDataString(formData, "outputPath"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Skill run failed.", 400);
  }
}
