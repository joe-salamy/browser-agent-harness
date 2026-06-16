import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWorkspaceAccess: vi.fn(),
  userFindUnique: vi.fn(),
  workspaceFindFirst: vi.fn(),
  workspaceFindUnique: vi.fn(),
  WorkspaceRole: { EDITOR: "EDITOR" },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    workspace: {
      findFirst: mocks.workspaceFindFirst,
      findUnique: mocks.workspaceFindUnique,
    },
  },
}));

vi.mock("@prisma/client", () => ({
  WorkspaceRole: mocks.WorkspaceRole,
}));

vi.mock("@/server/workspaces/access", () => ({
  assertWorkspaceAccess: mocks.assertWorkspaceAccess,
}));

import {
  formatSkillChainCommand,
  resolveUserWorkspace,
  shellQuote,
} from "./skill-chain-cli";

function expectedShellQuote(value: string): string {
  return process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

async function expectRejectMessage(
  promise: Promise<unknown>,
  message: string,
): Promise<void> {
  let rejection: unknown;
  try {
    await promise;
  } catch (error) {
    rejection = error;
  }
  expect(rejection).toBeInstanceOf(Error);
  expect((rejection as Error).message).toBe(message);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.userFindUnique.mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
  });
  mocks.workspaceFindFirst.mockResolvedValue({ id: "workspace-by-name" });
  mocks.workspaceFindUnique.mockResolvedValue({ id: "workspace-1" });
});

describe("skill chain CLI utilities", () => {
  it("formats skill chain commands with quoted values and trailing flags", () => {
    expect(
      formatSkillChainCommand(
        {
          "resume-state-path": "chains/state.json",
          "user-email": "user@example.com",
        },
        ["allow-scripts"],
      ),
    ).toBe(
      `npm run skill-chain -- --resume-state-path ${expectedShellQuote(
        "chains/state.json",
      )} --user-email ${expectedShellQuote(
        "user@example.com",
      )} --allow-scripts`,
    );

    expect(formatSkillChainCommand({ "workspace-id": "workspace-1" })).toBe(
      `npm run skill-chain -- --workspace-id ${expectedShellQuote(
        "workspace-1",
      )}`,
    );
  });

  it("quotes single quotes for the current platform", () => {
    expect(shellQuote("can't")).toBe(
      process.platform === "win32" ? "'can''t'" : "'can'\\''t'",
    );
  });

  it("resolves user workspace by workspace id", async () => {
    await expect(
      resolveUserWorkspace({
        userEmail: "user@example.com",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({
      userId: "user-1",
      workspaceId: "workspace-1",
      userEmail: "user@example.com",
    });

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
    expect(mocks.workspaceFindUnique).toHaveBeenCalledWith({
      where: { id: "workspace-1" },
    });
    expect(mocks.workspaceFindFirst).not.toHaveBeenCalled();
    expect(mocks.assertWorkspaceAccess).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      mocks.WorkspaceRole.EDITOR,
    );
  });

  it("resolves user workspace by workspace name", async () => {
    await expect(
      resolveUserWorkspace({
        userEmail: "user@example.com",
        workspaceName: "Research",
      }),
    ).resolves.toEqual({
      userId: "user-1",
      workspaceId: "workspace-by-name",
      userEmail: "user@example.com",
    });

    expect(mocks.workspaceFindUnique).not.toHaveBeenCalled();
    expect(mocks.workspaceFindFirst).toHaveBeenCalledWith({
      where: {
        name: "Research",
        members: { some: { userId: "user-1" } },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.assertWorkspaceAccess).toHaveBeenCalledWith(
      "user-1",
      "workspace-by-name",
      mocks.WorkspaceRole.EDITOR,
    );
  });

  it("preserves user workspace validation errors", async () => {
    await expectRejectMessage(
      resolveUserWorkspace({ workspaceId: "workspace-1" }),
      "--user-email is required.",
    );
    await expectRejectMessage(
      resolveUserWorkspace({ userEmail: "user@example.com" }),
      "Provide exactly one of --workspace-id or --workspace-name.",
    );
    await expectRejectMessage(
      resolveUserWorkspace({
        userEmail: "user@example.com",
        workspaceId: "workspace-1",
        workspaceName: "Research",
      }),
      "Provide exactly one of --workspace-id or --workspace-name.",
    );

    mocks.userFindUnique.mockResolvedValueOnce(null);
    await expectRejectMessage(
      resolveUserWorkspace({
        userEmail: "missing@example.com",
        workspaceId: "workspace-1",
      }),
      "User not found: missing@example.com.",
    );

    mocks.workspaceFindUnique.mockResolvedValueOnce(null);
    await expectRejectMessage(
      resolveUserWorkspace({
        userEmail: "user@example.com",
        workspaceId: "missing-workspace",
      }),
      "Workspace not found.",
    );
  });
});
