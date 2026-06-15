import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";

export default async function HomePage() {
  const userId = await getCurrentUserId();
  if (userId) redirect("/workspaces");

  return (
    <main className="container" style={{ padding: "64px 0" }}>
      <section className="card" style={{ maxWidth: 820 }}>
        <p className="badge">Open-source browser-native agent workspace</p>
        <h1>Run domain-neutral knowledge-work agents over your workspace files.</h1>
        <p className="muted">
          Browser Agent Harness provides workspaces, durable files, skills, model credentials, MCP governance,
          audit logs, and exports without introducing a vertical-specific product surface.
        </p>
        <Link className="btn" href="/sign-in">Sign in to the MVP</Link>
      </section>
    </main>
  );
}
