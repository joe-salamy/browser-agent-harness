import { requireUserId } from "@/lib/auth";
import { createWorkspaceExport } from "@/server/workspaces/files";
import { workspaceRouteErrorResponse } from "../../route-errors";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const exportFile = await createWorkspaceExport(userId, workspaceId);
    const body = exportFile.bytes.buffer.slice(
      exportFile.bytes.byteOffset,
      exportFile.bytes.byteOffset + exportFile.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": exportFile.contentType,
        "Content-Disposition": `attachment; filename="${exportFile.filename}"`,
      },
    });
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Export failed.", 404);
  }
}
