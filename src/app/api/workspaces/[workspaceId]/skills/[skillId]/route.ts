import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { runSkill, UnknownSkillError } from "@/server/skills/registry";
import { workspaceRouteErrorResponse } from "../../../route-errors";

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

function optionalFormDataBoolean(formData: FormData, field: string): boolean {
  const value = formData.get(field);
  if (value === null) return false;
  if (typeof value !== "string") throw new Error("Invalid request body.");
  switch (value) {
    case "true":
    case "1":
    case "on":
      return true;
    case "false":
    case "0":
    case "off":
      return false;
    default:
      throw new Error("Invalid request body.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; skillId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId, skillId } = await context.params;
    const formData = await request.formData();
    const result = await runSkill({
      userId,
      workspaceId,
      skillId,
      prompt: optionalFormDataString(formData, "prompt") ?? "",
      model: optionalFormDataString(formData, "model"),
      outputPath: optionalFormDataString(formData, "outputPath"),
      allowScripts: optionalFormDataBoolean(formData, "allowScripts"),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnknownSkillError) {
      return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
    }
    return workspaceRouteErrorResponse(error, "Skill run failed.", 400);
  }
}
