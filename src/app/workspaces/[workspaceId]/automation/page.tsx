import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getWorkspaceAutomationData } from "@/server/workspaces/queries";
import { AutomationClient } from "./automation-client";
import { RefreshListener } from "../refresh-listener";

type Props = { params: Promise<{ workspaceId: string }> };

export default async function AutomationPage({ params }: Props) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");
  const { workspaceId } = await params;
  const { workspace, files, skills, canEdit } = await getWorkspaceAutomationData({
    userId,
    workspaceId,
  });

  return (
    <main className="container page">
      <RefreshListener />
      <p>
        <Link href={`/workspaces/${workspaceId}`}>← Workspace</Link>
      </p>
      <header className="card">
        <h1>Automation</h1>
        <p className="muted">
          Create skill-chain manifests, preview runs, launch new chains, and
          resume saved chain state for {workspace.name}.
        </p>
      </header>
      <AutomationClient
        workspaceId={workspaceId}
        files={files}
        skills={skills}
        canEdit={canEdit}
      />
    </main>
  );
}
