import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRole, type Workspace } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  workspaceMemberFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceMember: {
      findUnique: mocks.workspaceMemberFindUnique,
    },
  },
}));

import {
  assertWorkspaceAccess,
  requireWorkspaceMembership,
  WorkspaceAccessError,
} from "./access";

const workspace = {
  id: "workspace-1",
  ownerId: "owner-1",
  name: "Research",
  instructions: "Use citations.",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
} as unknown as Workspace;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireWorkspaceMembership", () => {
  it("returns the workspace and role for sufficient membership", async () => {
    mocks.workspaceMemberFindUnique.mockResolvedValue({
      role: WorkspaceRole.EDITOR,
      workspace,
    });

    await expect(
      requireWorkspaceMembership(
        "user-1",
        "workspace-1",
        WorkspaceRole.VIEWER,
      ),
    ).resolves.toEqual({ workspace, role: WorkspaceRole.EDITOR });
    expect(mocks.workspaceMemberFindUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: { workspaceId: "workspace-1", userId: "user-1" },
      },
      include: { workspace: true },
    });
  });

  it("throws WorkspaceAccessError for insufficient membership", async () => {
    mocks.workspaceMemberFindUnique.mockResolvedValue({
      role: WorkspaceRole.VIEWER,
      workspace,
    });

    await expect(
      requireWorkspaceMembership(
        "user-1",
        "workspace-1",
        WorkspaceRole.EDITOR,
      ),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("throws WorkspaceAccessError for missing membership", async () => {
    mocks.workspaceMemberFindUnique.mockResolvedValue(null);

    await expect(
      requireWorkspaceMembership(
        "user-1",
        "workspace-1",
        WorkspaceRole.VIEWER,
      ),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
});

describe("assertWorkspaceAccess", () => {
  it("still returns only the workspace", async () => {
    mocks.workspaceMemberFindUnique.mockResolvedValue({
      role: WorkspaceRole.OWNER,
      workspace,
    });

    await expect(
      assertWorkspaceAccess("user-1", "workspace-1", WorkspaceRole.EDITOR),
    ).resolves.toBe(workspace);
  });
});
