import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { createWorkspaceFile } from "@/server/workspaces/files";
import { workspaceRouteErrorResponse } from "../../route-errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    const submittedPath =
      String(formData.get("path") ?? "").trim() || file.name;
    const bytes = Buffer.from(await file.arrayBuffer());
    const created = await createWorkspaceFile({
      userId,
      workspaceId,
      path: submittedPath,
      bytes,
      contentType: file.type || "application/octet-stream",
    });
    return NextResponse.json({ id: created.id });
  } catch (error) {
    return workspaceRouteErrorResponse(error, "Upload failed.", 400);
  }
}
