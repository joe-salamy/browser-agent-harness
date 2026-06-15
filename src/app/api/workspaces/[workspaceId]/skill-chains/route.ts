import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import type { SkillChainManifest } from "@/server/skill-chains/types";
import { runSkillChain } from "@/server/skill-chains/runner";
import { workspaceRouteErrorResponse } from "../../route-errors";

type SkillChainRunBody = {
  manifest?: unknown;
  manifestFileId?: string;
  manifestPath?: string;
  initialInput?: string;
  model?: string;
  resumeStatePath?: string;
};

function parseBody(value: unknown): SkillChainRunBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid request body.");
  const record = value as Record<string, unknown>;
  return {
    manifest: record.manifest,
    manifestFileId: typeof record.manifestFileId === "string" ? record.manifestFileId : undefined,
    manifestPath: typeof record.manifestPath === "string" ? record.manifestPath : undefined,
    initialInput: typeof record.initialInput === "string" ? record.initialInput : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    resumeStatePath: typeof record.resumeStatePath === "string" ? record.resumeStatePath : undefined,
  };
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const body = parseBody(await request.json());
    const result = await runSkillChain({
      userId,
      workspaceId,
      manifest: body.manifest as SkillChainManifest | undefined,
      manifestFileId: body.manifestFileId,
      manifestPath: body.manifestPath,
      initialInput: body.initialInput,
      model: body.model,
      resumeStatePath: body.resumeStatePath,
    });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Skill chain run failed.", 400);
  }
}
