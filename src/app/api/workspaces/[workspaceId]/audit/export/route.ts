import { requireUserId } from "@/lib/auth";
import { listAuditLogs } from "@/server/audit/log";
import { workspaceRouteErrorResponse } from "../../../route-errors";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
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
    return workspaceRouteErrorResponse(error, "Audit export failed.", 404);
  }
}
