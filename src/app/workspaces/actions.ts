"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import {
  formDataString,
  optionalFormDataBoolean,
} from "@/server/request-parsing";
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
    name: formDataString(formData, "name"),
  });
  redirect(`/workspaces/${id}`);
}

export async function updateInstructionsAction(
  formData: FormData,
): Promise<void> {
  const workspaceId = formDataString(formData, "workspaceId");
  await updateWorkspaceInstructions({
    workspaceId,
    instructions: formDataString(formData, "instructions"),
  });
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function saveTextFileAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = formDataString(formData, "workspaceId");
  await writeWorkspaceTextFile({
    userId,
    workspaceId,
    fileId: formDataString(formData, "fileId"),
    text: formDataString(formData, "text"),
  });
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function saveModelCredentialAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = formDataString(formData, "workspaceId");
  await saveOpenRouterCredential({
    userId,
    workspaceId,
    label: formDataString(formData, "label"),
    apiKey: formDataString(formData, "apiKey"),
    isDefault: optionalFormDataBoolean(formData, "isDefault"),
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/models`);
}

export async function revokeModelCredentialAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = formDataString(formData, "workspaceId");
  await revokeModelCredential({
    userId,
    workspaceId,
    credentialId: formDataString(formData, "credentialId"),
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/models`);
}

export async function createMcpConnectionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = formDataString(formData, "workspaceId");
  await createMcpConnection({
    userId,
    workspaceId,
    name: formDataString(formData, "name"),
    transport: formData.has("transport")
      ? formDataString(formData, "transport")
      : "HTTP_SSE",
    url: formDataString(formData, "url"),
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/mcp`);
}

export async function setMcpPermissionAction(
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = formDataString(formData, "workspaceId");
  await setMcpToolPermission({
    userId,
    workspaceId,
    connectionId: formDataString(formData, "connectionId"),
    toolName: formDataString(formData, "toolName"),
    allowed: optionalFormDataBoolean(formData, "allowed"),
  });
  revalidatePath(`/workspaces/${workspaceId}/settings/mcp`);
}
