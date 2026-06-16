import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  assertWorkspaceAccess: vi.fn(),
  listAvailableSkills: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
}));

vi.mock("@/server/workspaces/access", () => ({
  assertWorkspaceAccess: mocks.assertWorkspaceAccess,
}));

vi.mock("@/server/skills/registry", () => ({
  listAvailableSkills: mocks.listAvailableSkills,
}));

import { WorkspaceRole } from "@prisma/client";
import { GET } from "./route";

const context = { params: Promise.resolve({ workspaceId: "workspace-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.listAvailableSkills.mockResolvedValue([
    {
      id: "core.research-synthesis",
      name: "Research Synthesis",
      source: "core",
      description: "Synthesizes supported workspace text files into a sourced Markdown summary.",
      chainRunnable: true,
      hasEntrypoint: false,
      referenceCount: 0,
      scriptCount: 0,
      requiredPermissions: ["files:read", "files:write", "models:generate"],
    },
  ]);
});

describe("workspace skills list route", () => {
  it("checks viewer access and returns available skill summaries", async () => {
    const response = await GET(new Request("http://test"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      skills: [
        expect.objectContaining({
          id: "core.research-synthesis",
          source: "core",
          chainRunnable: true,
        }),
      ],
    });
    expect(mocks.assertWorkspaceAccess).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      WorkspaceRole.VIEWER,
    );
    expect(mocks.listAvailableSkills).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
  });
});
