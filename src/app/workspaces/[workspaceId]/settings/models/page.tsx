import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { listModelCredentials } from "@/server/models/credentials";
import {
  saveModelCredentialAction,
  revokeModelCredentialAction,
} from "../../../actions";
import { requireWorkspaceOwner } from "../require-owner";

type Props = { params: Promise<{ workspaceId: string }> };

export default async function ModelSettingsPage({ params }: Props) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  const { workspaceId } = await params;
  await requireWorkspaceOwner(userId, workspaceId);
  const credentials = await listModelCredentials(userId, workspaceId);

  return (
    <main className="container" style={{ padding: "32px 0" }}>
      <p>
        <Link href={`/workspaces/${workspaceId}`}>← Workspace</Link>
      </p>
      <section className="card">
        <h1>Model settings</h1>
        <p className="muted">
          OpenRouter credentials are encrypted at rest and never displayed after
          submission.
        </p>
        <form className="grid" action={saveModelCredentialAction}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label>
            Label
            <input className="input" name="label" required />
          </label>
          <label>
            OpenRouter API key
            <input
              className="input"
              name="apiKey"
              type="password"
              required
              autoComplete="off"
            />
          </label>
          <label>
            <input type="checkbox" name="isDefault" defaultChecked /> Default
            credential
          </label>
          <button className="btn" type="submit">
            Save credential
          </button>
        </form>
      </section>
      <section className="card" style={{ marginTop: 20 }}>
        <h2>Saved credentials</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Provider</th>
              <th>Default</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((credential) => (
              <tr key={credential.id}>
                <td>{credential.label}</td>
                <td>{credential.provider}</td>
                <td>{credential.isDefault ? "yes" : "no"}</td>
                <td>{credential.createdAt.toISOString()}</td>
                <td>
                  <form action={revokeModelCredentialAction}>
                    <input
                      type="hidden"
                      name="workspaceId"
                      value={workspaceId}
                    />
                    <input
                      type="hidden"
                      name="credentialId"
                      value={credential.id}
                    />
                    <button className="btn secondary" type="submit">
                      Revoke
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
