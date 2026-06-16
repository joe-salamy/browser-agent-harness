import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { minimalAgentRuntime } from "@/server/agents/minimal-runtime";
import { workspaceRouteErrorResponse } from "../../route-errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const formData = await request.formData();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const model = String(formData.get("model") ?? "").trim() || undefined;
    if (!prompt)
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    const result = await minimalAgentRuntime.run({
      userId,
      workspaceId,
      prompt,
      model,
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Run failed.", 400);
  }
}
