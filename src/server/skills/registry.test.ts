import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DirectoryModule from "./directory";

const mocks = vi.hoisted(() => ({
  assertWorkspaceAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  runtimeRun: vi.fn(),
  buildSkillChainManifest: vi.fn(),
  runWebSearchGroundingSkill: vi.fn(),
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

vi.mock("@/server/skill-chains/builder", () => ({
  buildSkillChainManifest: mocks.buildSkillChainManifest,
}));

vi.mock("@/server/skills/web-search", () => ({
  runWebSearchGroundingSkill: mocks.runWebSearchGroundingSkill,
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

import { CORE_SKILLS, listAvailableSkills, runSkill } from "./registry";

const directorySummary = {
  id: "workspace.my-skill",
  name: "my-skill",
  source: "workspace" as const,
  description: "Runs workspace instructions.",
  chainRunnable: true,
  hasEntrypoint: false,
  referenceCount: 1,
  scriptCount: 1,
  requiredPermissions: ["files:read", "files:write", "models:generate"],
};

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
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertWorkspaceAccess.mockResolvedValue({});
  mocks.listDirectorySkills.mockResolvedValue([directorySummary]);
  mocks.loadDirectorySkill.mockResolvedValue(null);
});

describe("skill registry authorization and dispatch", () => {
  it("lists core skills before discovered directory skills", async () => {
    await expect(
      listAvailableSkills({ userId: "user-1", workspaceId: "workspace-1" }),
    ).resolves.toEqual([
      CORE_SKILLS["core.research-synthesis"],
      CORE_SKILLS["core.web-search-grounding"],
      CORE_SKILLS["core.chain-builder"],
      directorySummary,
    ]);
  });

  it("checks workspace editor access before auditing or starting a known core run", async () => {
    mocks.assertWorkspaceAccess.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.research-synthesis",
      }),
    ).rejects.toThrow("Forbidden");

    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
    expect(mocks.runWebSearchGroundingSkill).not.toHaveBeenCalled();
  });

  it("rejects syntactically invalid skill ids before access or audit side effects", async () => {
    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "toString",
      }),
    ).rejects.toThrow("Unknown skill: toString.");

    expect(mocks.assertWorkspaceAccess).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
    expect(mocks.buildSkillChainManifest).not.toHaveBeenCalled();
    expect(mocks.runWebSearchGroundingSkill).not.toHaveBeenCalled();
  });

  it("forwards model and output path to research synthesis runtime", async () => {
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
        prompt: "Focus on policy.",
        model: "openai/gpt-4.1-mini",
        outputPath: "outputs/summary.md",
      }),
    ).resolves.toMatchObject({ runId: "run-1", status: "SUCCEEDED" });

    expect(mocks.runtimeRun).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt:
        "Synthesize the readable workspace files into: Summary, Key Findings, Source Notes, and Recommended Next Steps. Focus on policy.",
      model: "openai/gpt-4.1-mini",
      outputPath: "outputs/summary.md",
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "skill.run.started",
        metadata: {
          skillId: "core.research-synthesis",
          source: "core",
          name: "Research Synthesis",
          allowScripts: false,
        },
      }),
    );
  });

  it("dispatches web search grounding after editor access and skill audit", async () => {
    mocks.runWebSearchGroundingSkill.mockResolvedValueOnce({
      runId: "run-1",
      status: "SUCCEEDED",
      outputFileId: "file-1",
    });

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.web-search-grounding",
        prompt: "Find updates.",
      }),
    ).resolves.toMatchObject({ runId: "run-1", status: "SUCCEEDED" });

    expect(mocks.runWebSearchGroundingSkill).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Find updates.",
      model: undefined,
      outputPath: undefined,
    });
  });

  it("dispatches chain builder after editor access and skill audit", async () => {
    mocks.buildSkillChainManifest.mockResolvedValueOnce({
      runId: "run-2",
      status: "SUCCEEDED",
      outputFileId: "file-2",
      manifestPath: "chains/manifests/run-2.json",
    });

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "core.chain-builder",
        prompt: "Build a chain.",
      }),
    ).resolves.toMatchObject({ runId: "run-2", status: "SUCCEEDED" });

    expect(mocks.buildSkillChainManifest).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Build a chain.",
      model: undefined,
      outputPath: undefined,
    });
  });

  it("runs directory skills with instructions, references, and scripts as supplemental context", async () => {
    mocks.loadDirectorySkill.mockResolvedValueOnce(directorySkill);
    mocks.runtimeRun.mockResolvedValueOnce({ runId: "run-3", status: "SUCCEEDED" });

    await expect(
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "workspace.my-skill",
        prompt: "Use the schema.",
      }),
    ).resolves.toMatchObject({ runId: "run-3", status: "SUCCEEDED" });

    expect(mocks.runtimeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: expect.stringContaining("Skill: my-skill"),
        supplementalContexts: [
          {
            label: "Skill References",
            content: "## references/schema.md\n# Schema",
          },
          {
            label: "Skill Scripts",
            content: "## scripts/validate.js\nconsole.log('ok');",
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
      runSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "workspace.my-skill",
        prompt: "Use scripts.",
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
        runSkill({
          userId: "user-1",
          workspaceId: "workspace-1",
          skillId: "workspace.my-skill",
          prompt: "Use scripts.",
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
        runSkill({
          userId: "user-1",
          workspaceId: "workspace-1",
          skillId: "workspace.my-skill",
          prompt: "Use scripts.",
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
        runSkill({
          userId: "user-1",
          workspaceId: "workspace-1",
          skillId: "workspace.my-skill",
          prompt: "Use scripts.",
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
              label: "Skill Script Output",
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
