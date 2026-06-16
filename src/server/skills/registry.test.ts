import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DirectoryModule from "./directory";
import type { LoadedDirectorySkill, SkillSummary } from "./directory";

const mocks = vi.hoisted(() => ({
  assertWorkspaceAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  runtimeRun: vi.fn(),
  listDirectorySkills: vi.fn(),
  loadDirectorySkill: vi.fn(),
  runSkillEntrypoint: vi.fn(),
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

vi.mock("@/server/skills/directory", async (importOriginal) => {
  const actual = await importOriginal<typeof DirectoryModule>();
  return {
    ...actual,
    listDirectorySkills: mocks.listDirectorySkills,
    loadDirectorySkill: mocks.loadDirectorySkill,
  };
});

vi.mock("@/server/skills/script-runner", () => ({
  runSkillEntrypoint: mocks.runSkillEntrypoint,
}));

import { listAvailableSkills, runAgentWithSkills } from "./registry";

const directorySummary = {
  id: "workspace.my-skill",
  name: "my-skill",
  source: "workspace",
  description: "Runs workspace instructions.",
  chainRunnable: true,
  hasEntrypoint: false,
  referenceCount: 1,
  scriptCount: 1,
  requiredPermissions: ["files:read", "files:write", "models:generate"],
} as const satisfies SkillSummary;

const directorySkill = {
  ...directorySummary,
  instructions: "Always cite the reference.",
  skillMarkdown:
    "---\nname: my-skill\ndescription: Runs workspace instructions.\n---\nAlways cite the reference.",
  references: [
    {
      path: "references/schema.md",
      contentType: "text/markdown",
      text: "# Schema",
      truncated: false,
    },
  ],
  scripts: [
    {
      path: "scripts/validate.js",
      contentType: "text/javascript",
      text: "console.log('ok');",
      truncated: false,
    },
  ],
} as const satisfies LoadedDirectorySkill;

const serverSkill = {
  id: "server.other-skill",
  name: "other-skill",
  source: "server",
  description: "Runs server instructions.",
  chainRunnable: true,
  hasEntrypoint: false,
  referenceCount: 0,
  scriptCount: 0,
  requiredPermissions: ["files:read", "files:write", "models:generate"],
  instructions: "Use server instructions.",
  skillMarkdown:
    "---\nname: other-skill\ndescription: Runs server instructions.\n---\nUse server instructions.",
  references: [],
  scripts: [],
} as const satisfies LoadedDirectorySkill;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.listDirectorySkills.mockResolvedValue([directorySummary]);
  mocks.loadDirectorySkill.mockResolvedValue(null);
});

describe("skill registry authorization and dispatch", () => {
  it("lists discovered directory skills only", async () => {
    await expect(
      listAvailableSkills({ userId: "user-1", workspaceId: "workspace-1" }),
    ).resolves.toEqual([directorySummary]);
  });

  it("runs without skills when skillIds is omitted", async () => {
    mocks.runtimeRun.mockResolvedValueOnce({ runId: "run-1", status: "SUCCEEDED" });

    await expect(
      runAgentWithSkills({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Run plainly.",
        model: "openai/gpt-4.1-mini",
        outputPath: "outputs/plain.md",
      }),
    ).resolves.toMatchObject({ runId: "run-1", status: "SUCCEEDED" });

    expect(mocks.runtimeRun).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Run plainly.",
      model: "openai/gpt-4.1-mini",
      outputPath: "outputs/plain.md",
    });
    expect(mocks.assertWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.loadDirectorySkill).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("runs without skills when skillIds is empty", async () => {
    mocks.runtimeRun.mockResolvedValueOnce({ runId: "run-2", status: "SUCCEEDED" });

    await runAgentWithSkills({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Run plainly.",
      skillIds: [],
    });

    expect(mocks.runtimeRun).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Run plainly.",
      model: undefined,
      outputPath: undefined,
    });
    expect(mocks.loadDirectorySkill).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("rejects core skill ids before access, audit, or runtime calls", async () => {
    await expect(
      runAgentWithSkills({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Use old skill.",
        skillIds: ["core.research-synthesis"],
      }),
    ).rejects.toThrow("Unknown skill: core.research-synthesis.");

    expect(mocks.assertWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
  });

  it("rejects duplicate skill ids before loading or runtime calls", async () => {
    await expect(
      runAgentWithSkills({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Use duplicate skills.",
        skillIds: ["workspace.my-skill", "workspace.my-skill"],
      }),
    ).rejects.toThrow("Duplicate skill selected: workspace.my-skill.");

    expect(mocks.loadDirectorySkill).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
  });

  it("loads multiple skills in request order and calls the runtime once", async () => {
    mocks.loadDirectorySkill
      .mockResolvedValueOnce(directorySkill)
      .mockResolvedValueOnce(serverSkill);
    mocks.runtimeRun.mockResolvedValueOnce({ runId: "run-3", status: "SUCCEEDED" });

    await expect(
      runAgentWithSkills({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Use both skills.",
        skillIds: ["workspace.my-skill", "server.other-skill"],
      }),
    ).resolves.toMatchObject({ runId: "run-3", status: "SUCCEEDED" });

    expect(mocks.loadDirectorySkill).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "workspace.my-skill",
    });
    expect(mocks.loadDirectorySkill).toHaveBeenNthCalledWith(2, {
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "server.other-skill",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "skill.loaded",
        targetId: "workspace.my-skill",
        summary: "Loaded skill my-skill.",
        metadata: {
          skillId: "workspace.my-skill",
          source: "workspace",
          name: "my-skill",
          allowScripts: false,
        },
      }),
    );
    expect(mocks.runtimeRun).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Use both skills.",
        supplementalContexts: [
          {
            label: "Skill Instructions (workspace.my-skill)",
            content: expect.stringContaining("Skill: my-skill"),
          },
          {
            label: "Skill References (workspace.my-skill)",
            content: "## references/schema.md\n# Schema",
          },
          {
            label: "Skill Scripts (workspace.my-skill)",
            content: "## scripts/validate.js\nconsole.log('ok');",
          },
          {
            label: "Skill Instructions (server.other-skill)",
            content: expect.stringContaining("Skill: other-skill"),
          },
        ],
      }),
    );
  });

  it("fails entrypoint skills without allowScripts before model calls", async () => {
    mocks.loadDirectorySkill.mockResolvedValueOnce({
      ...directorySkill,
      hasEntrypoint: true,
      entrypoint: "scripts/validate.js",
    });

    await expect(
      runAgentWithSkills({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Use scripts.",
        skillIds: ["workspace.my-skill"],
        allowScripts: false,
      }),
    ).rejects.toThrow("Skill script execution is not enabled for this run.");

    expect(mocks.runSkillEntrypoint).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
  });

  it("rejects missing entrypoint assets before spawning or calling the model", async () => {
    const originalEnabled = process.env.SKILL_SCRIPTS_ENABLED;
    process.env.SKILL_SCRIPTS_ENABLED = "true";
    try {
      mocks.loadDirectorySkill.mockResolvedValueOnce({
        ...directorySkill,
        hasEntrypoint: true,
        entrypoint: "scripts/missing.js",
      });

      await expect(
        runAgentWithSkills({
          userId: "user-1",
          workspaceId: "workspace-1",
          prompt: "Use scripts.",
          skillIds: ["workspace.my-skill"],
          allowScripts: true,
        }),
      ).rejects.toThrow("Skill entrypoint scripts/missing.js was not found.");

      expect(mocks.runSkillEntrypoint).not.toHaveBeenCalled();
      expect(mocks.runtimeRun).not.toHaveBeenCalled();
    } finally {
      if (originalEnabled === undefined) {
        delete process.env.SKILL_SCRIPTS_ENABLED;
      } else {
        process.env.SKILL_SCRIPTS_ENABLED = originalEnabled;
      }
    }
  });

  it("rejects truncated entrypoint assets before spawning or calling the model", async () => {
    const originalEnabled = process.env.SKILL_SCRIPTS_ENABLED;
    process.env.SKILL_SCRIPTS_ENABLED = "true";
    try {
      mocks.loadDirectorySkill.mockResolvedValueOnce({
        ...directorySkill,
        hasEntrypoint: true,
        entrypoint: "scripts/validate.js",
        scripts: [{ ...directorySkill.scripts[0], truncated: true }],
      });

      await expect(
        runAgentWithSkills({
          userId: "user-1",
          workspaceId: "workspace-1",
          prompt: "Use scripts.",
          skillIds: ["workspace.my-skill"],
          allowScripts: true,
        }),
      ).rejects.toThrow(
        "Skill entrypoint scripts/validate.js exceeds the executable skill script size limit.",
      );

      expect(mocks.runSkillEntrypoint).not.toHaveBeenCalled();
      expect(mocks.runtimeRun).not.toHaveBeenCalled();
    } finally {
      if (originalEnabled === undefined) {
        delete process.env.SKILL_SCRIPTS_ENABLED;
      } else {
        process.env.SKILL_SCRIPTS_ENABLED = originalEnabled;
      }
    }
  });

  it("includes successful script output before directory model calls", async () => {
    const originalEnabled = process.env.SKILL_SCRIPTS_ENABLED;
    process.env.SKILL_SCRIPTS_ENABLED = "true";
    try {
      mocks.loadDirectorySkill.mockResolvedValueOnce({
        ...directorySkill,
        hasEntrypoint: true,
        entrypoint: "scripts/validate.js",
      });
      mocks.runSkillEntrypoint.mockResolvedValueOnce({
        stdout: "script-ok",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        durationMs: 12,
      });
      mocks.runtimeRun.mockResolvedValueOnce({ runId: "run-4", status: "SUCCEEDED" });

      await expect(
        runAgentWithSkills({
          userId: "user-1",
          workspaceId: "workspace-1",
          prompt: "Use scripts.",
          skillIds: ["workspace.my-skill"],
          allowScripts: true,
        }),
      ).resolves.toMatchObject({ runId: "run-4" });

      expect(mocks.runSkillEntrypoint).toHaveBeenCalledWith(
        expect.objectContaining({
          skillId: "workspace.my-skill",
          skillName: "my-skill",
          entrypoint: "scripts/validate.js",
          prompt: "Use scripts.",
        }),
      );
      expect(mocks.runtimeRun).toHaveBeenCalledWith(
        expect.objectContaining({
          supplementalContexts: expect.arrayContaining([
            {
              label: "Skill Script Output (workspace.my-skill)",
              content: "stdout:\nscript-ok\n\nstderr:\n",
            },
          ]),
        }),
      );
    } finally {
      if (originalEnabled === undefined) {
        delete process.env.SKILL_SCRIPTS_ENABLED;
      } else {
        process.env.SKILL_SCRIPTS_ENABLED = originalEnabled;
      }
    }
  });
});
