import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { listUserWorkspaces } from "@/server/workspaces/queries";
import { createWorkspaceAction } from "./actions";

export default async function WorkspacesPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  const workspaces = await listUserWorkspaces(userId);

  return (
    <main className="container page">
      <h1>Workspaces</h1>
      <div className="grid two">
        <section className="card">
          <h2>Create workspace</h2>
          <form className="grid" action={createWorkspaceAction}>
            <label>
              Name
              <input className="input" name="name" required minLength={1} />
            </label>
            <button className="btn" type="submit">
              Create
            </button>
          </form>
        </section>
        <section className="card">
          <h2>Your workspaces</h2>
          <div className="grid">
            {workspaces.map((workspace) => (
              <Link
                className="card"
                key={workspace.id}
                href={`/workspaces/${workspace.id}`}
              >
                <strong>{workspace.name}</strong>
                <p className="muted">Role: {workspace.role}</p>
              </Link>
            ))}
            {workspaces.length === 0 ? (
              <p className="muted">No workspaces yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
