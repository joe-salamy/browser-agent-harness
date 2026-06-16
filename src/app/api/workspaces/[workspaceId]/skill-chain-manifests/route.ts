import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import { buildSkillChainManifest } from "@/server/skill-chains/builder";
import {
  optionalJsonBoolean,
  optionalJsonString,
  parseJsonObject,
} from "@/server/request-parsing";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import { workspaceRouteErrorResponse } from "../../route-errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR);
    const body = parseJsonObject(await request.json());
    const prompt = optionalJsonString(body, "prompt");
    if (!prompt) {
      return NextResponse.json({ error: "Goal is required." }, { status: 400 });
    }
    const model = optionalJsonString(body, "model");
    const outputPath = optionalJsonString(body, "outputPath");
    const dryRun = optionalJsonBoolean(body, "dryRun") ?? false;

    if (dryRun) {
      return NextResponse.json({
        status: "DRY_RUN",
        workspaceId,
        goalCharacters: prompt.length,
      });
    }

    const result = await buildSkillChainManifest({
      userId,
      workspaceId,
      prompt,
      model,
      outputPath,
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(
      error,
      "Skill chain manifest creation failed.",
      400,
    );
  }
}
