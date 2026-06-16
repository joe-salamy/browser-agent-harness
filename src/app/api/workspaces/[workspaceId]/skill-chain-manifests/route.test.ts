import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  assertWorkspaceAccess: vi.fn(),
  buildSkillChainManifest: vi.fn(),
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

vi.mock("@/server/skill-chains/builder", () => ({
  buildSkillChainManifest: mocks.buildSkillChainManifest,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ workspaceId: "workspace-1" }) };

const manifest = {
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
  mocks.buildSkillChainManifest.mockResolvedValue({
    runId: "run-1",
    status: "SUCCEEDED",
    outputFileId: "file-1",
    outputPath: "chains/test-chain/manifest.json",
    manifestPath: "chains/test-chain/manifest.json",
    manifest,
  });
});

async function errorBody(response: Response): Promise<{ error: string }> {
  return (await response.json()) as { error: string };
}

describe("workspace skill-chain manifest creation route", () => {
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
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing prompt", body: {} },
    { name: "blank prompt", body: { prompt: "   " } },
  ])("rejects $name without creating a manifest", async ({ body }) => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Goal is required.",
    });
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
  });

  it.each([
    { field: "model", body: { prompt: "Create a chain.", model: 123 } },
    {
      field: "outputPath",
      body: { prompt: "Create a chain.", outputPath: false },
    },
  ])("rejects non-string optional field $field", async ({ body }) => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain manifest creation failed.",
    });
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
  });

  it("rejects non-boolean dryRun without creating a manifest", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({ prompt: "Create a chain.", dryRun: "true" }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill chain manifest creation failed.",
    });
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
  });

  it("returns a dry-run response without creating a manifest", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({ prompt: "  Create a chain.  ", dryRun: true }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "DRY_RUN",
      workspaceId: "workspace-1",
      goalCharacters: "Create a chain.".length,
    });
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
  });

  it("trims fields, creates the manifest, and returns the builder result", async () => {
    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          prompt: "  Create a chain.  ",
          model: "  openai/test  ",
          outputPath: "  chains/test-chain/manifest.json  ",
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.buildSkillChainManifest).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Create a chain.",
      model: "openai/test",
      outputPath: "chains/test-chain/manifest.json",
    });
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      status: "SUCCEEDED",
      outputFileId: "file-1",
      outputPath: "chains/test-chain/manifest.json",
      manifestPath: "chains/test-chain/manifest.json",
      manifest,
    });
  });
});
