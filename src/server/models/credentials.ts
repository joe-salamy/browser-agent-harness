import { ModelProvider, WorkspaceRole, type ModelCredential } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/server/audit/log";
import { OpenRouterAdapter, DEFAULT_OPENROUTER_MODEL } from "@/server/models/openrouter";
import type { ModelProviderAdapter } from "@/server/models/provider";
import { encryptSecret, decryptSecret } from "@/server/security/encryption";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

export async function saveOpenRouterCredential(input: {
  userId: string;
  workspaceId: string;
  label: string;
  apiKey: string;
  isDefault: boolean;
}): Promise<void> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.OWNER);
  const label = input.label.trim();
  const apiKey = input.apiKey.trim();
  if (!label || !apiKey) throw new Error("Credential label and API key are required.");
  const encrypted = await encryptSecret(apiKey);

  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.modelCredential.updateMany({
        where: { workspaceId: input.workspaceId, provider: ModelProvider.OPENROUTER, revokedAt: null },
        data: { isDefault: false },
      });
    }
    await tx.modelCredential.create({
      data: {
        ownerId: input.userId,
        workspaceId: input.workspaceId,
        provider: ModelProvider.OPENROUTER,
        label,
        ...encrypted,
        isDefault: input.isDefault,
      },
    });
  });

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "model.credential.saved",
    targetType: "modelCredential",
    summary: `Saved OpenRouter credential ${label}.`,
    metadata: { provider: "OPENROUTER", label, isDefault: input.isDefault },
  });
}

export async function revokeModelCredential(input: {
  userId: string;
  workspaceId: string;
  credentialId: string;
}): Promise<void> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.OWNER);
  await prisma.modelCredential.updateMany({
    where: { id: input.credentialId, workspaceId: input.workspaceId },
    data: { revokedAt: new Date(), isDefault: false },
  });
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "model.credential.revoked",
    targetType: "modelCredential",
    targetId: input.credentialId,
    summary: "Revoked model credential.",
    metadata: { provider: "OPENROUTER" },
  });
}

export async function listModelCredentials(userId: string, workspaceId: string): Promise<ModelCredential[]> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.OWNER);
  return prisma.modelCredential.findMany({
    where: { workspaceId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDefaultModelProvider(
  userId: string,
  workspaceId: string,
): Promise<{ provider: "OPENROUTER"; model: string; adapter: ModelProviderAdapter }> {
  await assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.VIEWER);
  const credential = await prisma.modelCredential.findFirst({
    where: { workspaceId, provider: ModelProvider.OPENROUTER, revokedAt: null, isDefault: true },
    orderBy: { createdAt: "desc" },
  });
  const apiKey = credential ? await decryptSecret(credential) : process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("No OpenRouter credential configured for this workspace.");
  return { provider: "OPENROUTER", model: DEFAULT_OPENROUTER_MODEL, adapter: new OpenRouterAdapter(apiKey) };
}
