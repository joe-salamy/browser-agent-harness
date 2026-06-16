import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRole } from "@prisma/client";

const mocks = vi.hoisted(() => {
  class UnsupportedTextFileError extends Error {
    constructor() {
      super("File type is stored but not readable by core text tools.");
      this.name = "UnsupportedTextFileError";
    }
  }
  const roleRank: Record<string, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

  return {
    workspaceMemberFindMany: vi.fn(),
    requireWorkspaceMembership: vi.fn(),
    hasRoleAtLeast: vi.fn((actual: string, minimum: string) => {
      return roleRank[actual] >= roleRank[minimum];
    }),
    listWorkspaceFiles: vi.fn(),
    readWorkspaceTextFile: vi.fn(),
    isCoreReadableText: vi.fn((filePath: string, contentType: string) => {
      return filePath.endsWith(".md") || contentType === "text/plain";
    }),
    listAvailableSkills: vi.fn(),
    listAuditLogs: vi.fn(),
    UnsupportedTextFileError,
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceMember: {
      findMany: mocks.workspaceMemberFindMany,
    },
  },
}));

vi.mock("@/server/audit/log", () => ({
  listAuditLogs: mocks.listAuditLogs,
}));

vi.mock("@/server/skills/registry", () => ({
  listAvailableSkills: mocks.listAvailableSkills,
}));

vi.mock("@/server/workspaces/access", () => ({
  hasRoleAtLeast: mocks.hasRoleAtLeast,
  requireWorkspaceMembership: mocks.requireWorkspaceMembership,
}));

vi.mock("@/server/workspaces/files", () => ({
  isCoreReadableText: mocks.isCoreReadableText,
  listWorkspaceFiles: mocks.listWorkspaceFiles,
  readWorkspaceTextFile: mocks.readWorkspaceTextFile,
  UnsupportedTextFileError: mocks.UnsupportedTextFileError,
}));

import { getWorkspaceOverview, listUserWorkspaces } from "./queries";

const workspace = {
  id: "workspace-1",
  name: "Research",
  instructions: "Use citations.",
};
const textFile = {
  id: "file-1",
  path: "notes.md",
  contentType: "text/markdown",
  sizeBytes: 12,
  currentVersion: { versionNumber: 3 },
};
const binaryFile = {
  id: "file-2",
  path: "scan.pdf",
  contentType: "application/pdf",
  sizeBytes: 24,
  currentVersion: { versionNumber: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspaceMembership.mockResolvedValue({
    workspace,
    role: WorkspaceRole.VIEWER,
  });
  mocks.listWorkspaceFiles.mockResolvedValue([]);
  mocks.listAvailableSkills.mockResolvedValue([]);
  mocks.listAuditLogs.mockResolvedValue([]);
});

describe("listUserWorkspaces", () => {
  it("returns narrow workspace DTOs ordered by workspace update time", async () => {
    mocks.workspaceMemberFindMany.mockResolvedValue([
      {
        role: WorkspaceRole.OWNER,
        workspace: { id: "workspace-1", name: "Research" },
      },
      {
        role: WorkspaceRole.VIEWER,
        workspace: { id: "workspace-2", name: "Archive" },
      },
    ]);

    await expect(listUserWorkspaces("user-1")).resolves.toEqual([
      { id: "workspace-1", name: "Research", role: WorkspaceRole.OWNER },
      { id: "workspace-2", name: "Archive", role: WorkspaceRole.VIEWER },
    ]);
    expect(mocks.workspaceMemberFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        role: true,
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { workspace: { updatedAt: "desc" } },
    });
  });
});

describe("getWorkspaceOverview", () => {
  it.each([
    [WorkspaceRole.VIEWER, false],
    [WorkspaceRole.EDITOR, true],
    [WorkspaceRole.OWNER, true],
  ])("sets canEdit for %s membership", async (role, canEdit) => {
    mocks.requireWorkspaceMembership.mockResolvedValue({ workspace, role });

    await expect(
      getWorkspaceOverview({ userId: "user-1", workspaceId: "workspace-1" }),
    ).resolves.toMatchObject({ canEdit });
    expect(mocks.requireWorkspaceMembership).toHaveBeenCalledTimes(1);
    expect(mocks.requireWorkspaceMembership).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      WorkspaceRole.VIEWER,
    );
  });

  it("returns supported selected text for the selected file", async () => {
    mocks.listWorkspaceFiles.mockResolvedValue([textFile, binaryFile]);
    mocks.readWorkspaceTextFile.mockResolvedValue({
      file: { path: "notes.md" },
      text: "hello",
    });

    await expect(
      getWorkspaceOverview({ userId: "user-1", workspaceId: "workspace-1" }),
    ).resolves.toMatchObject({
      files: [
        { id: "file-1", readableByCore: true },
        { id: "file-2", readableByCore: false },
      ],
      selected: { fileId: "file-1", path: "notes.md", text: "hello" },
    });
    expect(mocks.readWorkspaceTextFile).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      "file-1",
    );
  });

  it("returns the UnsupportedTextFileError message for unsupported selected text", async () => {
    mocks.listWorkspaceFiles.mockResolvedValue([binaryFile]);
    mocks.readWorkspaceTextFile.mockRejectedValue(
      new mocks.UnsupportedTextFileError(),
    );

    await expect(
      getWorkspaceOverview({
        userId: "user-1",
        workspaceId: "workspace-1",
        selectedFileId: "file-2",
      }),
    ).resolves.toMatchObject({
      selected: {
        fileId: "file-2",
        path: "scan.pdf",
        unsupported: "File type is stored but not readable by core text tools.",
      },
    });
  });

  it("returns the generic read fallback for other selected text errors", async () => {
    mocks.listWorkspaceFiles.mockResolvedValue([textFile]);
    mocks.readWorkspaceTextFile.mockRejectedValue(new Error("storage down"));

    await expect(
      getWorkspaceOverview({
        userId: "user-1",
        workspaceId: "workspace-1",
        selectedFileId: "file-1",
      }),
    ).resolves.toMatchObject({
      selected: {
        fileId: "file-1",
        path: "notes.md",
        unsupported: "File could not be read.",
      },
    });
  });

  it("returns null for an unknown selected file", async () => {
    mocks.listWorkspaceFiles.mockResolvedValue([textFile]);

    await expect(
      getWorkspaceOverview({
        userId: "user-1",
        workspaceId: "workspace-1",
        selectedFileId: "missing-file",
      }),
    ).resolves.toMatchObject({ selected: null });
    expect(mocks.readWorkspaceTextFile).not.toHaveBeenCalled();
  });
});
