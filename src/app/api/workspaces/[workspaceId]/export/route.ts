import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { createWorkspaceExport } from "@/server/workspaces/files";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 403 });
  }
}
