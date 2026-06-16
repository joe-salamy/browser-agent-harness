import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWorkspaceAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  listAvailableSkills: vi.fn(),
  runSkill: vi.fn(),
  createWorkspaceFile: vi.fn(),
  getWorkspaceFileByPath: vi.fn(),
  readWorkspaceTextFile: vi.fn(),
  writeWorkspaceTextFile: vi.fn(),
}));

vi.mock("@/server/workspaces/access", () => ({
  assertWorkspaceAccess: mocks.assertWorkspaceAccess,
}));

vi.mock("@/server/audit/log", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/server/skills/registry", () => ({
  listAvailableSkills: mocks.listAvailableSkills,
  runSkill: mocks.runSkill,
}));

vi.mock("@/server/workspaces/files", () => ({
  createWorkspaceFile: mocks.createWorkspaceFile,
  getWorkspaceFileByPath: mocks.getWorkspaceFileByPath,
  readWorkspaceTextFile: mocks.readWorkspaceTextFile,
  writeWorkspaceTextFile: mocks.writeWorkspaceTextFile,
}));

import { runSkillChain } from "./runner";
import type { SkillChainManifest } from "./types";

const manifest: SkillChainManifest = {
  version: 1,
  id: "dynamic-chain",
  name: "Dynamic Chain",
  steps: [
    {
      id: "workspace-step",
      skillId: "workspace.my-skill",
      prompt: "Run workspace skill.",
      outputPath: "chains/{{runId}}/{{stepIndex}}-workspace-step.md",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.listAvailableSkills.mockResolvedValue([
    {
      id: "workspace.my-skill",
      name: "my-skill",
      source: "workspace",
      description: "Runnable workspace skill.",
      chainRunnable: true,
      hasEntrypoint: false,
      referenceCount: 0,
      scriptCount: 0,
      requiredPermissions: ["files:read", "files:write", "models:generate"],
    },
  ]);
  const createdFiles = new Map<string, { id: string; path: string }>();
  mocks.getWorkspaceFileByPath.mockImplementation(
    async (_userId: string, _workspaceId: string, filePath: string) =>
      createdFiles.get(filePath) ?? null,
  );
  mocks.createWorkspaceFile.mockImplementation(async (input) => {
    const file = { id: `file-${input.path}`, path: input.path };
    createdFiles.set(input.path, file);
    return file;
  });
  mocks.writeWorkspaceTextFile.mockResolvedValue({});
});

describe("skill chain dynamic skill validation", () => {
  it("runs syntactically valid workspace skills and passes allowScripts to executors", async () => {
    const executeStep = vi.fn().mockResolvedValue({
      status: "SUCCEEDED",
      agentRunId: "run-step-1",
      outputFileId: "output-file-1",
      outputPath: "chains/output.md",
    });

    const result = await runSkillChain({
      userId: "user-1",
      workspaceId: "workspace-1",
      manifest,
      initialInput: "Initial input.",
      allowScripts: true,
      executeStep,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(executeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: "workspace.my-skill",
        allowScripts: true,
      }),
    );
  });

  it("passes allowScripts through the default runSkill executor", async () => {
    mocks.runSkill.mockResolvedValueOnce({
      runId: "agent-run-1",
      status: "SUCCEEDED",
      outputFileId: "output-file-1",
      outputPath: "chains/output.md",
    });

    const result = await runSkillChain({
      userId: "user-1",
      workspaceId: "workspace-1",
      manifest,
      initialInput: "Initial input.",
      allowScripts: true,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(mocks.runSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "workspace.my-skill",
        prompt: expect.stringContaining("Run workspace skill."),
        allowScripts: true,
        outputPath: expect.stringMatching(
          /^chains\/dynamic-chain-\d{14}-[a-f0-9]{8}\/01-workspace-step\.md$/,
        ),
      }),
    );
  });

  it("rejects unknown dynamic skills before creating state files or executing steps", async () => {
    mocks.listAvailableSkills.mockResolvedValueOnce([]);
    const executeStep = vi.fn();

    await expect(
      runSkillChain({
        userId: "user-1",
        workspaceId: "workspace-1",
        manifest,
        initialInput: "Initial input.",
        executeStep,
      }),
    ).rejects.toThrow(
      "Skill chain step workspace-step references unavailable skill workspace.my-skill.",
    );

    expect(mocks.createWorkspaceFile).not.toHaveBeenCalled();
    expect(executeStep).not.toHaveBeenCalled();
  });

  it("rejects non-chain-runnable skills with the unavailable-skill message", async () => {
    mocks.listAvailableSkills.mockResolvedValueOnce([
      {
        id: "workspace.my-skill",
        name: "my-skill",
        source: "workspace",
        description: "Not runnable.",
        chainRunnable: false,
        hasEntrypoint: false,
        referenceCount: 0,
        scriptCount: 0,
        requiredPermissions: ["files:read", "files:write", "models:generate"],
      },
    ]);

    await expect(
      runSkillChain({
        userId: "user-1",
        workspaceId: "workspace-1",
        manifest,
        initialInput: "Initial input.",
      }),
    ).rejects.toThrow(
      "Skill chain step workspace-step references unavailable skill workspace.my-skill.",
    );
  });
});
