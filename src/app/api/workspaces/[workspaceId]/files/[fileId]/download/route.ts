import { requireUserId } from "@/lib/auth";
import { getWorkspaceFileDownload } from "@/server/workspaces/files";
import { workspaceRouteErrorResponse } from "../../../../route-errors";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string; fileId: string }> }) {
  try {
    const userId = await requireUserId();
    const { workspaceId, fileId } = await context.params;
    const { file, bytes } = await getWorkspaceFileDownload(userId, workspaceId, fileId);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
      },
    });
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Download failed.", 404);
  }
}
