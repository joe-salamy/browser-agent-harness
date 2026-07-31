import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getWorkspaceOverview } from "@/server/workspaces/queries";
import { updateInstructionsAction, saveTextFileAction } from "../actions";
import { UploadForm } from "./upload-form";
import { RunForm } from "./run-form";
import { RefreshListener } from "./refresh-listener";

type Props = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ fileId?: string }>;
};

export default async function WorkspacePage({ params, searchParams }: Props) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  const { workspaceId } = await params;
  const query = await searchParams;
  const { workspace, files, skills, logs, canEdit, selected } =
    await getWorkspaceOverview({
      userId,
      workspaceId,
      selectedFileId: query.fileId,
    });

  return (
    <main className="container page">
      <RefreshListener />
      <p>
        <Link href="/workspaces">← Workspaces</Link>
      </p>
      <header className="grid two align-start">
        <div>
          <h1>{workspace.name}</h1>
          <p className="muted">
            Workspace boundary, files, skills, model settings, MCP registry,
            runs, audit, and export.
          </p>
        </div>
        <nav className="card grid">
          <Link href={`/workspaces/${workspaceId}/settings/models`}>
            Model settings
          </Link>
          <Link href={`/workspaces/${workspaceId}/settings/mcp`}>
            MCP settings
          </Link>
          <a
            className="btn secondary"
            href={`/api/workspaces/${workspaceId}/export`}
          >
            Download workspace export
          </a>
          <a
            className="btn secondary"
            href={`/api/workspaces/${workspaceId}/audit/export`}
          >
            Download audit-log.json
          </a>
        </nav>
      </header>

      <div className="grid two with-top-gap">
        <section className="card">
          <h2>Instructions</h2>
          <form className="grid" action={updateInstructionsAction}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <label>
              Instructions
              <textarea
                className="input"
                name="instructions"
                rows={7}
                defaultValue={workspace.instructions}
                disabled={!canEdit}
              />
            </label>
            <button className="btn" type="submit" disabled={!canEdit}>
              Save instructions
            </button>
          </form>
          <p className="muted">
            Empty instructions are allowed; the runtime then uses only prompt
            and file context.
          </p>
        </section>

        <section className="card">
          <h2>Run</h2>
          <RunForm workspaceId={workspaceId} skills={skills} />
        </section>
      </div>

      <div className="grid two with-top-gap">
        <section className="card">
          <h2>Files</h2>
          {canEdit ? (
            <UploadForm workspaceId={workspaceId} />
          ) : (
            <p className="muted">Viewer role can download and read only.</p>
          )}
          <table className="table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Path</th>
                <th>Type</th>
                <th>Bytes</th>
                <th>Version</th>
                <th>Core text</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    <Link href={`/workspaces/${workspaceId}?fileId=${file.id}`}>
                      {file.path}
                    </Link>
                  </td>
                  <td>{file.contentType}</td>
                  <td>{file.sizeBytes}</td>
                  <td>{file.currentVersion?.versionNumber ?? "—"}</td>
                  <td>{file.readableByCore ? "readable" : "stored only"}</td>
                  <td>
                    <a
                      href={`/api/workspaces/${workspaceId}/files/${file.id}/download`}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Text viewer/editor</h2>
          {selected?.text !== undefined ? (
            <form className="grid" action={saveTextFileAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="fileId" value={selected.fileId} />
              <p className="badge">{selected.path}</p>
              <textarea
                className="input"
                name="text"
                rows={18}
                defaultValue={selected.text}
                readOnly={!canEdit}
              />
              <button className="btn" type="submit" disabled={!canEdit}>
                Save new version
              </button>
            </form>
          ) : selected ? (
            <div>
              <p className="badge">{selected.path}</p>
              <p className="muted">{selected.unsupported}</p>
            </div>
          ) : (
            <p className="muted">Select a file to view supported text.</p>
          )}
        </section>
      </div>

      <section className="card with-top-gap">
        <h2>Audit log</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Summary</th>
              <th>Actor</th>
              <th>Run</th>
              <th>Time</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.eventType}</td>
                <td>{log.summary}</td>
                <td>{log.actorUserId ?? "system"}</td>
                <td>{log.agentRunId ?? "—"}</td>
                <td>{log.createdAt.toISOString()}</td>
                <td>
                  <details>
                    <summary>JSON</summary>
                    <pre>{JSON.stringify(log.metadataJson, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
