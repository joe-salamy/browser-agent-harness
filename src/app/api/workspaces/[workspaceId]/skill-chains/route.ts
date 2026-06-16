import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import type { SkillChainManifest } from "@/server/skill-chains/types";
import { runSkillChain } from "@/server/skill-chains/runner";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import {
  optionalJsonBoolean,
  optionalJsonString,
  parseJsonObject,
} from "@/server/request-parsing";
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
    const result = await runSkillChain({
      userId,
      workspaceId,
      manifest: body.manifest as SkillChainManifest | undefined,
      manifestFileId: optionalJsonString(body, "manifestFileId"),
      manifestPath: optionalJsonString(body, "manifestPath"),
      initialInput: optionalJsonString(body, "initialInput"),
      model: optionalJsonString(body, "model"),
      resumeStatePath: optionalJsonString(body, "resumeStatePath"),
      allowScripts: optionalJsonBoolean(body, "allowScripts"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Skill chain run failed.", 400);
  }
}
