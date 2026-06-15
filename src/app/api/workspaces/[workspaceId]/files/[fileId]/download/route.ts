import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getWorkspaceFileDownload } from "@/server/workspaces/files";

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Download failed." }, { status: 403 });
  }
}
