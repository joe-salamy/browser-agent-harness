import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import {
  parseSkillChainManifest,
  type SkillChainManifest,
} from "@/server/skill-chains/types";
import { runSkillChain } from "@/server/skill-chains/runner";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import {
  optionalJsonBoolean,
  optionalJsonString,
  parseJsonObject,
} from "@/server/request-parsing";
import { workspaceRouteErrorResponse } from "../../route-errors";

type SkillChainRouteModeInput = {
  manifest?: SkillChainManifest;
  manifestFileId?: string;
  manifestPath?: string;
  initialInput?: string;
  resumeStatePath?: string;
};

function countManifestSources(input: SkillChainRouteModeInput): number {
  return (
    (input.manifest ? 1 : 0) +
    (input.manifestFileId ? 1 : 0) +
    (input.manifestPath ? 1 : 0)
  );
}

function validateSkillChainModeForRoute(input: SkillChainRouteModeInput): void {
  const manifestSources = countManifestSources(input);
  const inputSources = input.initialInput ? 1 : 0;

  if (input.resumeStatePath) {
    if (inputSources > 0 || manifestSources > 1) {
      throw new Error("Invalid skill chain mode.");
    }
    return;
  }

  if (manifestSources !== 1 || inputSources !== 1) {
    throw new Error("Invalid skill chain mode.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR);
    const body = parseJsonObject(await request.json());
    const manifest =
      "manifest" in body ? parseSkillChainManifest(body.manifest) : undefined;
    const manifestFileId = optionalJsonString(body, "manifestFileId");
    const manifestPath = optionalJsonString(body, "manifestPath");
    const initialInput = optionalJsonString(body, "initialInput");
    const model = optionalJsonString(body, "model");
    const resumeStatePath = optionalJsonString(body, "resumeStatePath");
    const allowScripts = optionalJsonBoolean(body, "allowScripts");
    const dryRun = optionalJsonBoolean(body, "dryRun") ?? false;

    const input = {
      manifest,
      manifestFileId,
      manifestPath,
      initialInput,
      resumeStatePath,
    };
    validateSkillChainModeForRoute(input);

    if (dryRun) {
      return NextResponse.json({
        status: "DRY_RUN",
        workspaceId,
        mode: resumeStatePath ? "resume" : "new",
        manifestId: manifest?.id,
        scriptsEnabled: allowScripts === true,
      });
    }

    const result = await runSkillChain({
      userId,
      workspaceId,
      manifest,
      manifestFileId,
      manifestPath,
      initialInput,
      model,
      resumeStatePath,
      allowScripts,
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Skill chain run failed.", 400);
  }
}
