import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { listWorkspaceMcpConnections } from "@/server/mcp/registry";
import {
  createMcpConnectionAction,
  setMcpPermissionAction,
} from "../../../actions";
import { requireWorkspaceOwner } from "../require-owner";

type Props = { params: Promise<{ workspaceId: string }> };

export default async function McpSettingsPage({ params }: Props) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  const { workspaceId } = await params;
  await requireWorkspaceOwner(userId, workspaceId);
  const connections = await listWorkspaceMcpConnections(userId, workspaceId);

  return (
    <main className="container" style={{ padding: "32px 0" }}>
      <p>
        <Link href={`/workspaces/${workspaceId}`}>← Workspace</Link>
      </p>
      <section className="card">
        <h1>MCP registry</h1>
        <p className="muted">
          Registered MCP tools are permissioned and audited; invocation is not
          enabled in this MVP slice.
        </p>
        <form className="grid" action={createMcpConnectionAction}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label>
            Name
            <input className="input" name="name" required />
          </label>
          <label>
            Transport
            <select className="input" name="transport" defaultValue="HTTP_SSE">
              <option value="HTTP_SSE">HTTP_SSE</option>
              <option value="STDIO_DEV">STDIO_DEV</option>
            </select>
          </label>
          <label>
            URL
            <input
              className="input"
              name="url"
              placeholder="https://example.com/mcp or http://localhost:3999/mcp"
            />
          </label>
          <button className="btn" type="submit">
            Register connection
          </button>
        </form>
      </section>
      <section className="grid" style={{ marginTop: 20 }}>
        {connections.map((connection) => (
          <article className="card" key={connection.id}>
            <h2>{connection.name}</h2>
            <p className="muted">
              {connection.transport} ·{" "}
              {connection.enabled ? "enabled" : "disabled"} ·{" "}
              {connection.url ?? "metadata only"}
            </p>
            <form className="grid two" action={setMcpPermissionAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="connectionId" value={connection.id} />
              <input
                className="input"
                name="toolName"
                placeholder="tool name"
                maxLength={128}
                required
              />
              <select className="input" name="allowed" defaultValue="true">
                <option value="true">Allow</option>
                <option value="false">Deny</option>
              </select>
              <button className="btn" type="submit">
                Update permission
              </button>
            </form>
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Allowed</th>
                </tr>
              </thead>
              <tbody>
                {connection.permissions.map((permission) => (
                  <tr key={permission.id}>
                    <td>{permission.toolName}</td>
                    <td>{permission.allowed ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </section>
    </main>
  );
}
