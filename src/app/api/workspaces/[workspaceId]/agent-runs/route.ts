import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { runAgentWithSkills, UnknownSkillError } from "@/server/skills/registry";
import { workspaceRouteErrorResponse } from "../../route-errors";

function firstFormDataString(formData: FormData, field: string): string | null {
  let firstValue: string | null = null;
  for (const value of formData.getAll(field)) {
    if (typeof value !== "string") throw new Error("Invalid request body.");
    firstValue ??= value;
  }
  return firstValue;
}

function requiredFormDataString(formData: FormData, field: string): string {
  return (firstFormDataString(formData, field) ?? "").trim();
}

function optionalFormDataString(
  formData: FormData,
  field: string,
): string | undefined {
  const value = firstFormDataString(formData, field);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalFormDataBoolean(formData: FormData, field: string): boolean {
  const value = firstFormDataString(formData, field);
  if (value === null) return false;
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

function optionalFormDataStringList(formData: FormData, field: string): string[] {
  return formData.getAll(field).flatMap((value) => {
    if (typeof value !== "string") throw new Error("Invalid request body.");
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const formData = await request.formData();
    const prompt = requiredFormDataString(formData, "prompt");
    if (!prompt)
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    const result = await runAgentWithSkills({
      userId,
      workspaceId,
      prompt,
      skillIds: optionalFormDataStringList(formData, "skillIds"),
      model: optionalFormDataString(formData, "model"),
      outputPath: optionalFormDataString(formData, "outputPath"),
      allowScripts: optionalFormDataBoolean(formData, "allowScripts"),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnknownSkillError) {
      return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
    }
    return workspaceRouteErrorResponse(error, "Run failed.", 400);
  }
}
