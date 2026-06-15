import { McpTransport, WorkspaceRole, type McpConnection, type McpPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/server/audit/log";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

function validateMcpUrl(transport: "HTTP_SSE" | "STDIO_DEV", rawUrl?: string): string | null {
  if (transport === "STDIO_DEV") return rawUrl?.trim() || null;
  const value = rawUrl?.trim();
  if (!value) throw new Error("HTTP_SSE MCP connections require a URL.");
  const url = new URL(value);
  const isLocalhost = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("HTTP_SSE MCP connections require https:// URLs in production.");
  }
  if (process.env.NODE_ENV !== "production" && url.protocol !== "https:" && !isLocalhost) {
    throw new Error("Development HTTP_SSE MCP connections must use https:// or http://localhost.");
  }
  return url.toString();
}

export async function createMcpConnection(input: {
  userId: string;
  workspaceId: string;
  name: string;
  transport: "HTTP_SSE" | "STDIO_DEV";
  url?: string;
}): Promise<McpConnection> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.OWNER);
  const name = input.name.trim();
  if (!name) throw new Error("MCP connection name is required.");
  if (input.transport === "STDIO_DEV" && process.env.NODE_ENV === "production") {
    throw new Error("STDIO_DEV MCP connections are disabled in production.");
  }
  const connection = await prisma.mcpConnection.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      transport: input.transport as McpTransport,
      url: validateMcpUrl(input.transport, input.url),
      enabled: input.transport === "HTTP_SSE" || process.env.NODE_ENV !== "production",
      createdById: input.userId,
    },
  });
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "mcp.connection.created",
    targetType: "mcpConnection",
    targetId: connection.id,
    summary: `Created MCP connection ${name}.`,
    metadata: { transport: input.transport, enabled: connection.enabled },
  });
  return connection;
}

export async function setMcpToolPermission(input: {
  userId: string;
  workspaceId: string;
  connectionId: string;
  toolName: string;
  allowed: boolean;
}): Promise<void> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.OWNER);
  const toolName = input.toolName.trim();
  if (!toolName || toolName.length > 128) throw new Error("Tool name is required and must be at most 128 characters.");
  const connection = await prisma.mcpConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!connection) throw new Error("MCP connection not found.");
  await prisma.mcpPermission.upsert({
    where: { connectionId_toolName: { connectionId: input.connectionId, toolName } },
    create: {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      toolName,
      allowed: input.allowed,
    },
    update: { allowed: input.allowed },
  });
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "mcp.permission.updated",
    targetType: "mcpConnection",
    targetId: input.connectionId,
    summary: `${input.allowed ? "Allowed" : "Denied"} MCP tool ${toolName}.`,
    metadata: { toolName, allowed: input.allowed },
  });
}

export async function listWorkspaceMcpConnections(
  userId: string,
  workspaceId: string,
): Promise<Array<McpConnection & { permissions: McpPermission[] }>> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  return prisma.mcpConnection.findMany({
    where: { workspaceId },
    include: { permissions: { orderBy: { toolName: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}
