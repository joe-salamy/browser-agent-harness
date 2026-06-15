import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  assertWorkspaceAccess: vi.fn(),
  runSkillChain: vi.fn(),
  WorkspaceAccessError: class WorkspaceAccessError extends Error {
    constructor(message = "Forbidden") {
      super(message);
      this.name = "WorkspaceAccessError";
    }
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
}));

vi.mock("@/server/workspaces/access", () => ({
  assertWorkspaceAccess: mocks.assertWorkspaceAccess,
  WorkspaceAccessError: mocks.WorkspaceAccessError,
}));

vi.mock("@/server/skill-chains/runner", () => ({
  runSkillChain: mocks.runSkillChain,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.runSkillChain.mockResolvedValue({
    runId: "run-1",
    status: "SUCCEEDED",
    statePath: "chains/test/run-1/chain-state.json",
    manifestPath: "chains/test/run-1/chain-manifest.json",
    initialInputPath: "chains/test/run-1/initial-input.md",
    currentStepIndex: 1,
    steps: [],
  });
});

async function errorBody(response: Response): Promise<{ error: string }> {
  return (await response.json()) as { error: string };
}

const context = { params: Promise.resolve({ workspaceId: "workspace-1" }) };

describe("workspace skill-chain route", () => {
  it("checks editor access before parsing the request body", async () => {
    const request = { json: vi.fn().mockRejectedValue(new Error("body parsed")) } as unknown as Request;
    mocks.assertWorkspaceAccess.mockRejectedValueOnce(new mocks.WorkspaceAccessError());

    const response = await POST(request, context);

    expect(response.status).toBe(403);
    await expect(errorBody(response)).resolves.toEqual({ error: "Forbidden." });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("rejects non-string optional fields without starting a chain", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({ manifestPath: 123, initialInput: "input" }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({ error: "Skill chain run failed." });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("trims blank optional fields before dispatch", async () => {
    const manifest = {
      version: 1,
      id: "test-chain",
      name: "Test Chain",
      steps: [
        {
          id: "research",
          skillId: "core.research-synthesis",
          prompt: "Research.",
          outputPath: "chains/test-chain/{{runId}}/{{stepIndex}}-research.md",
        },
      ],
    };

    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({ manifest, manifestPath: "  ", initialInput: "  Evaluate this.  ", model: "  openai/test  " }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.runSkillChain).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      manifest,
      manifestFileId: undefined,
      manifestPath: undefined,
      initialInput: "Evaluate this.",
      model: "openai/test",
      resumeStatePath: undefined,
    });
  });
});
