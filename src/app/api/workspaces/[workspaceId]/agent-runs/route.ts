import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import {
  runAgentWithSkills,
  UnknownSkillError,
} from "@/server/skills/registry";
import {
  formDataString,
  formDataStringList,
  optionalFormDataBoolean,
  optionalTrimmedFormDataString,
} from "@/server/request-parsing";
import { workspaceRouteErrorResponse } from "../../route-errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const formData = await request.formData();
    const prompt = formDataString(formData, "prompt").trim();
    if (!prompt)
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    const result = await runAgentWithSkills({
      userId,
      workspaceId,
      prompt,
      skillIds: formDataStringList(formData, "skillIds"),
      model: optionalTrimmedFormDataString(formData, "model"),
      outputPath: optionalTrimmedFormDataString(formData, "outputPath"),
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
