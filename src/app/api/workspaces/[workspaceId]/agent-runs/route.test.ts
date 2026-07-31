import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  runAgentWithSkills: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
}));

vi.mock("@/server/skills/registry", () => {
  class UnknownSkillError extends Error {
    constructor(skillId: string) {
      super(`Unknown skill: ${skillId}.`);
      this.name = "UnknownSkillError";
    }
  }
  return {
    runAgentWithSkills: mocks.runAgentWithSkills,
    UnknownSkillError,
  };
});

import { UnknownSkillError } from "@/server/skills/registry";
import { POST } from "./route";

const context = { params: Promise.resolve({ workspaceId: "workspace-1" }) };

function formRequest(formData: FormData): Request {
  return new Request("http://test", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("user-1");
  mocks.runAgentWithSkills.mockResolvedValue({
    runId: "run-1",
    status: "SUCCEEDED",
    outputFileId: "file-1",
  });
});

describe("agent runs route", () => {
  it("returns a prompt-required error for blank prompts", async () => {
    const formData = new FormData();
    formData.set("prompt", "   ");

    const response = await POST(formRequest(formData), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Prompt is required.",
    });
    expect(mocks.runAgentWithSkills).not.toHaveBeenCalled();
  });

  it("returns a prompt-required error for missing prompts", async () => {
    const response = await POST(formRequest(new FormData()), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Prompt is required.",
    });
    expect(mocks.runAgentWithSkills).not.toHaveBeenCalled();
  });

  it("dispatches no selected skills with trimmed prompt and optional fields", async () => {
    const formData = new FormData();
    formData.set("prompt", "  Summarize files.  ");
    formData.set("model", "   ");
    formData.set("outputPath", "   ");

    const response = await POST(formRequest(formData), context);

    expect(response.status).toBe(200);
    expect(mocks.runAgentWithSkills).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Summarize files.",
      skillIds: [],
      model: undefined,
      outputPath: undefined,
      allowScripts: false,
    });
  });

  it("dispatches repeated skillIds in request order", async () => {
    const formData = new FormData();
    formData.set("prompt", "Use selected skills.");
    formData.append("skillIds", "server.research-synthesis");
    formData.append("skillIds", " workspace.my-skill ");
    formData.append("skillIds", "   ");
    formData.set("allowScripts", "on");

    const response = await POST(formRequest(formData), context);

    expect(response.status).toBe(200);
    expect(mocks.runAgentWithSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        skillIds: ["server.research-synthesis", "workspace.my-skill"],
        allowScripts: true,
      }),
    );
  });

  it("rejects File-valued prompt and skillIds before dispatch", async () => {
    const promptFormData = new FormData();
    promptFormData.set("prompt", new File(["Use file."], "prompt.txt"));

    const promptResponse = await POST(formRequest(promptFormData), context);

    expect(promptResponse.status).toBe(400);
    await expect(promptResponse.json()).resolves.toEqual({ error: "Run failed." });

    const skillFormData = new FormData();
    skillFormData.set("prompt", "Use skills.");
    skillFormData.append("skillIds", new File(["server.bad"], "skill.txt"));

    const skillResponse = await POST(formRequest(skillFormData), context);

    expect(skillResponse.status).toBe(400);
    await expect(skillResponse.json()).resolves.toEqual({ error: "Run failed." });
    expect(mocks.runAgentWithSkills).not.toHaveBeenCalled();
  });

  it("rejects File-valued optional scalar fields before dispatch", async () => {
    for (const field of ["model", "outputPath", "allowScripts"]) {
      const formData = new FormData();
      formData.set("prompt", "Run.");
      formData.set(field, "string-value");
      formData.append(field, new File(["bad"], `${field}.txt`));

      const response = await POST(formRequest(formData), context);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Run failed." });
    }
    expect(mocks.runAgentWithSkills).not.toHaveBeenCalled();
  });

  it("rejects invalid and whitespace-wrapped allowScripts values", async () => {
    for (const value of ["yes", " true "]) {
      const formData = new FormData();
      formData.set("prompt", "Run.");
      formData.set("allowScripts", value);

      const response = await POST(formRequest(formData), context);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Run failed." });
    }
    expect(mocks.runAgentWithSkills).not.toHaveBeenCalled();
  });

  it("maps unknown skills to the legacy 404 response", async () => {
    mocks.runAgentWithSkills.mockRejectedValueOnce(
      new UnknownSkillError("server.missing"),
    );
    const formData = new FormData();
    formData.set("prompt", "Run.");
    formData.set("skillIds", "server.missing");

    const response = await POST(formRequest(formData), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown skill." });
  });
});
