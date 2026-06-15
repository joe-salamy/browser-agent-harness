import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { listAuditLogs } from "@/server/audit/log";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const userId = await requireUserId();
    const { workspaceId } = await context.params;
    const logs = await listAuditLogs(userId, workspaceId);
    return new Response(JSON.stringify(logs, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="audit-log.json"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audit export failed." }, { status: 403 });
  }
}
