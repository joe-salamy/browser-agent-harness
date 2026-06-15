import { readFile } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { writeAuditLog } from "../src/server/audit/log";
import { createMcpConnection, setMcpToolPermission } from "../src/server/mcp/registry";
import { createWorkspaceFile } from "../src/server/workspaces/files";

const DEMOS = [
  {
    name: "Demo Workspace",
    instructions: "Always cite workspace filenames.",
    files: [] as string[],
  },
  {
    name: "Research Packet Demo",
    instructions: "Synthesize source notes with direct filename citations.",
    files: [
      "research-packet/market-notes.md",
      "research-packet/interviews.csv",
      "research-packet/source-list.json",
    ],
  },
  {
    name: "Policy Review Demo",
    instructions: "Review controls against the evidence log and checklist.",
    files: [
      "policy-review/security-policy.md",
      "policy-review/evidence-log.csv",
      "policy-review/checklist.md",
    ],
  },
  {
    name: "Campaign Planning Demo",
    instructions: "Use source notes to produce concise, grounded campaign planning output.",
    files: [
      "marketing-campaign/product-notes.md",
      "marketing-campaign/audience-notes.md",
      "marketing-campaign/brand-guidance.md",
      "marketing-campaign/performance.csv",
    ],
  },
  {
    name: "Internal Ops MCP Demo",
    instructions: "Track registered tools and permission decisions before any invocation is enabled.",
    files: ["internal-ops/operating-procedure.md"],
  },
];

const CONTENT_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
};

async function ensureWorkspace(userId: string, name: string, instructions: string) {
  const existing = await prisma.workspace.findFirst({ where: { name, ownerId: userId } });
  if (existing) {
    await prisma.workspace.update({ where: { id: existing.id }, data: { instructions } });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: existing.id, userId } },
      create: { workspaceId: existing.id, userId, role: WorkspaceRole.OWNER },
      update: { role: WorkspaceRole.OWNER },
    });
    return existing;
  }

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: userId,
      name,
      instructions,
      members: { create: { userId, role: WorkspaceRole.OWNER } },
    },
  });
  await writeAuditLog({
    workspaceId: workspace.id,
    actorUserId: userId,
    eventType: "workspace.created",
    targetType: "workspace",
    targetId: workspace.id,
    summary: `Created workspace ${name}.`,
    metadata: { name },
  });
  return workspace;
}

async function seedFile(userId: string, workspaceId: string, relativePath: string): Promise<void> {
  const existing = await prisma.workspaceFile.findFirst({ where: { workspaceId, path: relativePath, deletedAt: null } });
  if (existing) return;
  const bytes = await readFile(path.join(process.cwd(), "prisma", "demo-data", relativePath));
  const contentType = CONTENT_TYPES[path.extname(relativePath)] ?? "application/octet-stream";
  await createWorkspaceFile({ userId, workspaceId, path: relativePath, bytes, contentType });
}

async function main() {
  const passwordHash = await bcrypt.hash("demo-password", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    create: { email: "demo@example.com", name: "Demo User", passwordHash },
    update: { name: "Demo User", passwordHash },
  });

  for (const demo of DEMOS) {
    const workspace = await ensureWorkspace(user.id, demo.name, demo.instructions);
    for (const file of demo.files) await seedFile(user.id, workspace.id, file);

    if (demo.name === "Internal Ops MCP Demo" && process.env.NODE_ENV !== "production") {
      const existing = await prisma.mcpConnection.findFirst({
        where: { workspaceId: workspace.id, name: "Demo Knowledge Source" },
      });
      if (!existing) {
        const connection = await createMcpConnection({
          userId: user.id,
          workspaceId: workspace.id,
          name: "Demo Knowledge Source",
          transport: "HTTP_SSE",
          url: "http://localhost:3999/mcp",
        });
        await setMcpToolPermission({
          userId: user.id,
          workspaceId: workspace.id,
          connectionId: connection.id,
          toolName: "search_docs",
          allowed: true,
        });
      }
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
