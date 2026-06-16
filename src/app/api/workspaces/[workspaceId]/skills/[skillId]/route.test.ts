import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  class UnknownSkillError extends Error {
    constructor(skillId: string) {
      super(`Unknown skill: ${skillId}.`);
      this.name = "UnknownSkillError";
    }
  }
  return {
    requireUserId: vi.fn(),
    runSkill: vi.fn(),
    UnknownSkillError,
  };
});

vi.mock("@/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
}));

vi.mock("@/server/skills/registry", () => ({
  UnknownSkillError: mocks.UnknownSkillError,
  runSkill: mocks.runSkill,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.runSkill.mockResolvedValue({ runId: "run-1", status: "SUCCEEDED" });
});

async function errorBody(response: Response): Promise<{ error: string }> {
  return (await response.json()) as { error: string };
}

function context(skillId: string) {
  return { params: Promise.resolve({ workspaceId: "workspace-1", skillId }) };
}

describe("workspace skill route", () => {
  it("maps registry unknown skill errors to 404", async () => {
    mocks.runSkill.mockRejectedValueOnce(new mocks.UnknownSkillError("toString"));
    const response = await POST(
      new Request("http://test", { method: "POST", body: new FormData() }),
      context("toString"),
    );

    expect(response.status).toBe(404);
    await expect(errorBody(response)).resolves.toEqual({ error: "Unknown skill." });
    expect(mocks.runSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "toString",
      }),
    );
  });

  it("rejects File-valued form fields without running the skill", async () => {
    const formData = new FormData();
    formData.set("prompt", new Blob(["bad"]), "bad.txt");

    const response = await POST(
      new Request("http://test", { method: "POST", body: formData }),
      context("workspace.my-skill"),
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill run failed.",
    });
    expect(mocks.runSkill).not.toHaveBeenCalled();
  });

  it("rejects invalid allowScripts strings without running the skill", async () => {
    const formData = new FormData();
    formData.set("allowScripts", "yes");

    const response = await POST(
      new Request("http://test", { method: "POST", body: formData }),
      context("workspace.my-skill"),
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill run failed.",
    });
    expect(mocks.runSkill).not.toHaveBeenCalled();
  });

  it("rejects whitespace-wrapped allowScripts strings without running the skill", async () => {
    const formData = new FormData();
    formData.set("allowScripts", " true ");

    const response = await POST(
      new Request("http://test", { method: "POST", body: formData }),
      context("workspace.my-skill"),
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Skill run failed.",
    });
    expect(mocks.runSkill).not.toHaveBeenCalled();
  });

  it("trims optional string fields and parses allowScripts before dispatch", async () => {
    const formData = new FormData();
    formData.set("prompt", "  summarize  ");
    formData.set("model", "   ");
    formData.set("outputPath", " outputs/result.md ");
    formData.set("allowScripts", "on");

    const response = await POST(
      new Request("http://test", { method: "POST", body: formData }),
      context("workspace.my-skill"),
    );

    expect(response.status).toBe(200);
    expect(mocks.runSkill).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "workspace.my-skill",
      prompt: "summarize",
      model: undefined,
      outputPath: "outputs/result.md",
      allowScripts: true,
    });
  });

  it("defaults missing allowScripts to false", async () => {
    const response = await POST(
      new Request("http://test", { method: "POST", body: new FormData() }),
      context("core.research-synthesis"),
    );

    expect(response.status).toBe(200);
    expect(mocks.runSkill).toHaveBeenCalledWith(
      expect.objectContaining({ allowScripts: false }),
    );
  });
});
