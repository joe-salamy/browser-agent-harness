"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import {
  saveOpenRouterCredential,
  revokeModelCredential,
} from "@/server/models/credentials";
import {
  createMcpConnection,
  setMcpToolPermission,
} from "@/server/mcp/registry";
import {
  createWorkspace,
  updateWorkspaceInstructions,
} from "@/server/workspaces/mutations";
import { writeWorkspaceTextFile } from "@/server/workspaces/files";

export async function createWorkspaceAction(formData: FormData): Promise<void> {
  const { id } = await createWorkspace({
    name: String(formData.get("name") ?? ""),
  });
  redirect(`/workspaces/${id}`);
}

export async function updateInstructionsAction(
  formData: FormData,
): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await updateWorkspaceInstructions({
    workspaceId,
    instructions: String(formData.get("instructions") ?? ""),
  });
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function saveTextFileAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await writeWorkspaceTextFile({
    userId,
    workspaceId,
    fileId: String(formData.get("fileId") ?? ""),
    text: String(formData.get("text") ?? ""),
  });
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function saveModelCredentialAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await saveOpenRouterCredential({
    userId,
    workspaceId,
    label: String(formData.get("label") ?? ""),
    apiKey: String(formData.get("apiKey") ?? ""),
    isDefault: formData.get("isDefault") === "on",
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/models`);
}

export async function revokeModelCredentialAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await revokeModelCredential({
    userId,
    workspaceId,
    credentialId: String(formData.get("credentialId") ?? ""),
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/models`);
}

export async function createMcpConnectionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await createMcpConnection({
    userId,
    workspaceId,
    name: String(formData.get("name") ?? ""),
    transport: String(formData.get("transport") ?? "HTTP_SSE"),
    url: String(formData.get("url") ?? ""),
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/mcp`);
}

export async function setMcpPermissionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await setMcpToolPermission({
    userId,
    workspaceId,
    connectionId: String(formData.get("connectionId") ?? ""),
    toolName: String(formData.get("toolName") ?? ""),
    allowed: formData.get("allowed") === "true",
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/mcp`);
}
