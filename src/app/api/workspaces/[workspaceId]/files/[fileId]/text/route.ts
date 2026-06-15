import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { writeWorkspaceTextFile } from "@/server/workspaces/files";
import { workspaceRouteErrorResponse } from "../../../../route-errors";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; fileId: string }> }) {
  try {
    const userId = await requireUserId();
    const { workspaceId, fileId } = await context.params;
    const body = (await request.json()) as { text?: string; contentType?: string };
    const version = await writeWorkspaceTextFile({
      userId,
      workspaceId,
      fileId,
      text: body.text ?? "",
      contentType: body.contentType,
    });
    return NextResponse.json({ versionId: version.id, versionNumber: version.versionNumber });
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Save failed.", 400);
  }
}
