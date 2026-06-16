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

const validManifest = {
  version: 1,
  id: "test-chain",
  name: "Test Chain",
  steps: [
    {
      id: "research",
      skillId: "server.research-synthesis",
      prompt: "Research.",
      outputPath: "chains/test-chain/{{runId}}/{{stepIndex}}-research.md",
    },
  ],
};

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
    const request = {
      json: vi.fn().mockRejectedValue(new Error("body parsed")),
    } as unknown as Request;
    mocks.assertWorkspaceAccess.mockRejectedValueOnce(
      new mocks.WorkspaceAccessError(),
    );

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
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain run failed.",
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("rejects non-boolean allowScripts without starting a chain", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({ allowScripts: "true" }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain run failed.",
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("rejects null allowScripts without starting a chain", async () => {
    const response = await POST(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ allowScripts: null }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain run failed.",
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("rejects non-boolean dryRun without starting a chain", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          manifest: validManifest,
          initialInput: "Evaluate this.",
          dryRun: "true",
        }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain run failed.",
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("rejects invalid inline manifests before starting a chain", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          manifest: { version: 1, id: "Invalid Chain", name: "", steps: [] },
          initialInput: "Evaluate this.",
        }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain run failed.",
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("returns a new-run dry-run response without starting a chain", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          manifest: validManifest,
          initialInput: "Evaluate this.",
          allowScripts: true,
          dryRun: true,
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "DRY_RUN",
      workspaceId: "workspace-1",
      mode: "new",
      manifestId: "test-chain",
      scriptsEnabled: true,
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("returns a resume dry-run response without starting a chain", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          resumeStatePath: "chains/test/run-1/chain-state.json",
          dryRun: true,
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "DRY_RUN",
      workspaceId: "workspace-1",
      mode: "resume",
      scriptsEnabled: false,
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "new run missing manifest source",
      body: { initialInput: "Evaluate this." },
    },
    {
      name: "new run missing input",
      body: { manifest: validManifest },
    },
    {
      name: "new run with two manifest sources",
      body: {
        manifest: validManifest,
        manifestPath: "chains/test/manifest.json",
        initialInput: "Evaluate this.",
      },
    },
    {
      name: "resume with initial input",
      body: {
        resumeStatePath: "chains/test/run-1/chain-state.json",
        initialInput: "Evaluate this.",
      },
    },
    {
      name: "resume with two manifest sources",
      body: {
        resumeStatePath: "chains/test/run-1/chain-state.json",
        manifest: validManifest,
        manifestPath: "chains/test/manifest.json",
      },
    },
  ])("rejects invalid mode: $name", async ({ body }) => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain run failed.",
    });
    expect(mocks.runSkillChain).not.toHaveBeenCalled();
  });

  it("trims blank optional fields before dispatch", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          manifest: validManifest,
          manifestPath: "  ",
          initialInput: "  Evaluate this.  ",
          model: "  openai/test  ",
          allowScripts: true,
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.runSkillChain).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      manifest: validManifest,
      manifestFileId: undefined,
      manifestPath: undefined,
      initialInput: "Evaluate this.",
      model: "openai/test",
      resumeStatePath: undefined,
      allowScripts: true,
    });
  });
});
