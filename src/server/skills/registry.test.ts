import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWorkspaceAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  runtimeRun: vi.fn(),
}));

vi.mock("@/server/workspaces/access", () => ({
  assertWorkspaceAccess: mocks.assertWorkspaceAccess,
}));

vi.mock("@/server/audit/log", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/server/agents/minimal-runtime", () => ({
  minimalAgentRuntime: { run: mocks.runtimeRun },
}));

import { runSkill } from "./registry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("skill registry authorization", () => {
  it("checks workspace editor access before auditing or starting a run", async () => {
    mocks.assertWorkspaceAccess.mockRejectedValueOnce(new Error("denied"));

    await expect(
      runSkill({ userId: "user-1", workspaceId: "workspace-1", skillId: "core.research-synthesis" }),
    ).rejects.toThrow("denied");

    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
  });
});
