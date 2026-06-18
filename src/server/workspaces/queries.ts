import { WorkspaceRole, type AuditLog, type Workspace } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listAuditLogs } from "@/server/audit/log";
import type { SkillSummary } from "@/server/skills/directory";
import { listAvailableSkills } from "@/server/skills/registry";
import {
  hasRoleAtLeast,
  requireWorkspaceMembership,
} from "@/server/workspaces/access";
import {
  isCoreReadableText,
  listWorkspaceFiles,
  readWorkspaceTextFile,
  UnsupportedTextFileError,
  type WorkspaceFileWithCurrentVersion,
} from "@/server/workspaces/files";

export type WorkspaceListItem = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export type WorkspaceSelectedText = {
  fileId: string;
  path: string;
  text?: string;
  unsupported?: string;
};

type WorkspaceOverviewFile = WorkspaceFileWithCurrentVersion & {
  readableByCore: boolean;
};

export type WorkspaceOverview = {
  workspace: Workspace;
  files: WorkspaceOverviewFile[];
  skills: SkillSummary[];
  logs: AuditLog[];
  canEdit: boolean;
  selected: WorkspaceSelectedText | null;
};


export async function listUserWorkspaces(
  userId: string,
): Promise<WorkspaceListItem[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: {
      role: true,
      workspace: { select: { id: true, name: true } },
    },
    orderBy: { workspace: { updatedAt: "desc" } },
  });

  return memberships.map(({ role, workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    role,
  }));
}

async function getSelectedText(input: {
  userId: string;
  workspaceId: string;
  files: WorkspaceFileWithCurrentVersion[];
  selectedFileId: string | undefined;
}): Promise<WorkspaceSelectedText | null> {
  const selectedFileId = input.selectedFileId ?? input.files[0]?.id;
  if (!selectedFileId) return null;

  const selectedFile = input.files.find((file) => file.id === selectedFileId);
  if (!selectedFile) return null;

  try {
    const read = await readWorkspaceTextFile(
      input.userId,
      input.workspaceId,
      selectedFile.id,
    );
    return {
      fileId: selectedFile.id,
      path: read.file.path,
      text: read.text,
    };
  } catch (error) {
    return {
      fileId: selectedFile.id,
      path: selectedFile.path,
      unsupported:
        error instanceof UnsupportedTextFileError
          ? error.message
          : "File could not be read.",
    };
  }
}

export async function getWorkspaceOverview(input: {
  userId: string;
  workspaceId: string;
  selectedFileId?: string;
}): Promise<WorkspaceOverview> {
  const { workspace, role } = await requireWorkspaceMembership(
    input.userId,
    input.workspaceId,
    WorkspaceRole.VIEWER,
  );
  const canEdit = hasRoleAtLeast(role, WorkspaceRole.EDITOR);
  const [workspaceFiles, skills, logs] = await Promise.all([
    listWorkspaceFiles(input.userId, input.workspaceId),
    listAvailableSkills({
      userId: input.userId,
      workspaceId: input.workspaceId,
    }),
    listAuditLogs(input.userId, input.workspaceId),
  ]);
  const selected = await getSelectedText({
    userId: input.userId,
    workspaceId: input.workspaceId,
    files: workspaceFiles,
    selectedFileId: input.selectedFileId,
  });
  const files = workspaceFiles.map((file) => ({
    ...file,
    readableByCore: isCoreReadableText(file.path, file.contentType),
  }));

  return { workspace, files, skills, logs, canEdit, selected };
}

