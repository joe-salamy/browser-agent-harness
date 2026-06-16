import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

export type UserWorkspaceArgs = {
  workspaceId?: string;
  workspaceName?: string;
  userEmail?: string;
};

export type ResolvedUserWorkspace = {
  userId: string;
  workspaceId: string;
  userEmail: string;
};

export function shellQuote(value: string): string {
  return process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export function formatSkillChainCommand(
  args: Record<string, string>,
  flags: string[] = [],
): string {
  return [
    "npm",
    "run",
    "skill-chain",
    "--",
    ...Object.entries(args).flatMap(([name, value]) => [
      `--${name}`,
      shellQuote(value),
    ]),
    ...flags.map((name) => `--${name}`),
  ].join(" ");
}

export async function resolveUserWorkspace(
  args: UserWorkspaceArgs,
): Promise<ResolvedUserWorkspace> {
  if (!args.userEmail) throw new Error("--user-email is required.");
  if ((args.workspaceId ? 1 : 0) + (args.workspaceName ? 1 : 0) !== 1) {
    throw new Error(
      "Provide exactly one of --workspace-id or --workspace-name.",
    );
  }
  const user = await prisma.user.findUnique({
    where: { email: args.userEmail },
  });
  if (!user?.email) throw new Error(`User not found: ${args.userEmail}.`);
  const workspace = args.workspaceId
    ? await prisma.workspace.findUnique({ where: { id: args.workspaceId } })
    : await prisma.workspace.findFirst({
        where: {
          name: args.workspaceName,
          members: { some: { userId: user.id } },
        },
        orderBy: { createdAt: "desc" },
      });
  if (!workspace) throw new Error("Workspace not found.");
  await assertWorkspaceAccess(user.id, workspace.id, WorkspaceRole.EDITOR);
  return { userId: user.id, workspaceId: workspace.id, userEmail: user.email };
}
