import { NextResponse } from "next/server";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId } from "@/lib/auth";
import type { SkillChainManifest } from "@/server/skill-chains/types";
import { runSkillChain } from "@/server/skill-chains/runner";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import { workspaceRouteErrorResponse } from "../../route-errors";

type SkillChainRunBody = {
  manifest?: unknown;
  manifestFileId?: string;
  manifestPath?: string;
  initialInput?: string;
  model?: string;
  resumeStatePath?: string;
};

type SkillChainStringField = Exclude<keyof SkillChainRunBody, "manifest">;

function optionalStringField(
  record: Record<string, unknown>,
  field: SkillChainStringField,
): string | undefined {
  const value = record[field];
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid request body.");
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseBody(value: unknown): SkillChainRunBody {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid request body.");
  const record = value as Record<string, unknown>;
  return {
    manifest: record.manifest,
    manifestFileId: optionalStringField(record, "manifestFileId"),
    manifestPath: optionalStringField(record, "manifestPath"),
    initialInput: optionalStringField(record, "initialInput"),
    model: optionalStringField(record, "model"),
    resumeStatePath: optionalStringField(record, "resumeStatePath"),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR);
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
