import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWorkspaceAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  runtimeRun: vi.fn(),
  buildSkillChainManifest: vi.fn(),
  runWebSearchGroundingSkill: vi.fn(),
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

vi.mock("@/server/skill-chains/builder", () => ({
  buildSkillChainManifest: mocks.buildSkillChainManifest,
}));

vi.mock("@/server/skills/web-search", () => ({
  runWebSearchGroundingSkill: mocks.runWebSearchGroundingSkill,
}));

import { runSkill } from "./registry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("skill registry authorization and dispatch", () => {
  it("checks workspace editor access before auditing or starting a run", async () => {
    mocks.assertWorkspaceAccess.mockRejectedValueOnce(new Error("denied"));

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.research-synthesis",
      }),
    ).rejects.toThrow("denied");

    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
    expect(mocks.runWebSearchGroundingSkill).not.toHaveBeenCalled();
  });

  it("rejects unknown skill ids before access or audit side effects", async () => {
    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "toString",
      }),
    ).rejects.toThrow("Unknown skill.");

    expect(mocks.assertWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
    expect(mocks.runWebSearchGroundingSkill).not.toHaveBeenCalled();
  });

  it("forwards model and output path to research synthesis runtime", async () => {
    mocks.assertWorkspaceAccess.mockResolvedValueOnce({});
    mocks.runtimeRun.mockResolvedValueOnce({
      runId: "run-1",
      status: "SUCCEEDED",
      outputFileId: "file-1",
    });

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.research-synthesis",
        prompt: "Focus on risks.",
        model: "openai/gpt-4.1-mini",
        outputPath: "chains/run/01-research.md",
      }),
    ).resolves.toMatchObject({ runId: "run-1", status: "SUCCEEDED" });

    expect(mocks.runtimeRun).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt:
        "Synthesize the readable workspace files into: Summary, Key Findings, Source Notes, and Recommended Next Steps. Focus on risks.",
      model: "openai/gpt-4.1-mini",
      outputPath: "chains/run/01-research.md",
    });
  });

  it("dispatches web search grounding after editor access and skill audit", async () => {
    mocks.assertWorkspaceAccess.mockResolvedValueOnce({});
    mocks.runWebSearchGroundingSkill.mockResolvedValueOnce({
      runId: "run-web",
      status: "SUCCEEDED",
      outputFileId: "file-web",
      outputPath: "outputs/web.md",
    });

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.web-search-grounding",
        prompt: "Research current launch news.",
        model: "openai/gpt-4.1-mini",
        outputPath: "outputs/web.md",
      }),
    ).resolves.toMatchObject({ runId: "run-web", status: "SUCCEEDED" });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "skill.run.started" }),
    );
    expect(mocks.runWebSearchGroundingSkill).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Research current launch news.",
      model: "openai/gpt-4.1-mini",
      outputPath: "outputs/web.md",
    });
  });

  it("dispatches chain builder after editor access and skill audit", async () => {
    mocks.assertWorkspaceAccess.mockResolvedValueOnce({});
    mocks.buildSkillChainManifest.mockResolvedValueOnce({
      runId: "run-2",
      status: "SUCCEEDED",
      outputFileId: "file-2",
      outputPath: "chains/manifests/chain.json",
    });

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.chain-builder",
        prompt: "Build a chain.",
        model: "openai/gpt-4.1-mini",
        outputPath: "chains/manifests/chain.json",
      }),
    ).resolves.toMatchObject({ runId: "run-2", status: "SUCCEEDED" });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "skill.run.started" }),
    );
    expect(mocks.buildSkillChainManifest).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Build a chain.",
      model: "openai/gpt-4.1-mini",
      outputPath: "chains/manifests/chain.json",
    });
  });
});
