import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { createWorkspaceAction } from "./actions";

export default async function WorkspacesPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { workspace: { updatedAt: "desc" } },
  });

  return (
    <main className="container" style={{ padding: "32px 0" }}>
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
            {memberships.map(({ workspace, role }) => (
              <Link
                className="card"
                key={workspace.id}
                href={`/workspaces/${workspace.id}`}
              >
                <strong>{workspace.name}</strong>
                <p className="muted">Role: {role}</p>
              </Link>
            ))}
            {memberships.length === 0 ? (
              <p className="muted">No workspaces yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
