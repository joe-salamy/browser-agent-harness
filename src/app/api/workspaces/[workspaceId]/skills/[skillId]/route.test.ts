import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  assertWorkspaceAccess: vi.fn(),
  runSkill: vi.fn(),
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

vi.mock("@/server/skills/registry", () => ({
  BUILT_IN_SKILLS: {
    "core.research-synthesis": {
      id: "core.research-synthesis",
      name: "Research Synthesis",
      description: "Synthesizes supported workspace text files into a sourced Markdown summary.",
      requiredPermissions: ["files:read", "files:write", "models:generate"],
    },
  },
  runSkill: mocks.runSkill,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.runSkill.mockResolvedValue({ runId: "run-1", status: "SUCCEEDED" });
});

async function errorBody(response: Response): Promise<{ error: string }> {
  return (await response.json()) as { error: string };
}

function context(skillId: string) {
  return { params: Promise.resolve({ workspaceId: "workspace-1", skillId }) };
}

describe("workspace skill route", () => {
  it("rejects inherited skill ids without access or run side effects", async () => {
    const response = await POST(new Request("http://test.local", { method: "POST" }), context("toString"));

    expect(response.status).toBe(404);
    await expect(errorBody(response)).resolves.toEqual({ error: "Unknown skill." });
    expect(mocks.assertWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.runSkill).not.toHaveBeenCalled();
  });

  it("rejects File-valued form fields without running the skill", async () => {
    const formData = new FormData();
    formData.append("prompt", new Blob(["bad"]), "prompt.txt");

    const response = await POST(
      new Request("http://test.local", { method: "POST", body: formData }),
      context("core.research-synthesis"),
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({ error: "Skill run failed." });
    expect(mocks.runSkill).not.toHaveBeenCalled();
  });

  it("trims optional string fields before dispatch", async () => {
    const formData = new FormData();
    formData.set("prompt", "  Focus on risks.  ");
    formData.set("model", "   ");
    formData.set("outputPath", "  chains/run/01-research.md  ");

    const response = await POST(
      new Request("http://test.local", { method: "POST", body: formData }),
      context("core.research-synthesis"),
    );

    expect(response.status).toBe(200);
    expect(mocks.runSkill).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "core.research-synthesis",
      prompt: "Focus on risks.",
      model: undefined,
      outputPath: "chains/run/01-research.md",
    });
  });
});
