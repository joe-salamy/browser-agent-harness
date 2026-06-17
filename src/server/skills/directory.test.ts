import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

const mocks = vi.hoisted(() => ({
  getWorkspaceFileByPath: vi.fn(),
  isCoreReadableText: vi.fn(),
  listWorkspaceFiles: vi.fn(),
  normalizeWorkspacePath: vi.fn((inputPath: string) =>
    inputPath.replaceAll("\\", "/"),
  ),
  readWorkspaceTextFileCapped: vi.fn(),
}));

vi.mock("@/server/workspaces/files", () => ({
  getWorkspaceFileByPath: mocks.getWorkspaceFileByPath,
  isCoreReadableText: mocks.isCoreReadableText,
  listWorkspaceFiles: mocks.listWorkspaceFiles,
  normalizeWorkspacePath: mocks.normalizeWorkspacePath,
  readWorkspaceTextFileCapped: mocks.readWorkspaceTextFileCapped,
}));

import {
  MAX_SKILL_ASSET_CHARS,
  listDirectorySkills,
  loadDirectorySkill,
} from "./directory";

type MockWorkspaceFile = {
  id: string;
  path: string;
  contentType: string;
  sizeBytes: number;
  currentVersion: { id: string };
};

const originalSkillRoots = process.env.BROWSER_AGENT_SKILL_ROOTS;

function workspaceFile(id: string, filePath: string): MockWorkspaceFile {
  return {
    id,
    path: filePath,
    contentType: filePath.endsWith(".js") ? "text/javascript" : "text/markdown",
    sizeBytes: 1,
    currentVersion: { id: `${id}-version` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isCoreReadableText.mockReturnValue(true);
  mocks.listWorkspaceFiles.mockResolvedValue([]);
  delete process.env.BROWSER_AGENT_SKILL_ROOTS;
});

afterEach(() => {
  if (originalSkillRoots === undefined) {
    delete process.env.BROWSER_AGENT_SKILL_ROOTS;
  } else {
    process.env.BROWSER_AGENT_SKILL_ROOTS = originalSkillRoots;
  }
});

describe("directory skill loading", () => {
  it("discovers and loads workspace skills with references and scripts", async () => {
    const skillFile = workspaceFile("skill", "skills/my-skill/SKILL.md");
    const referenceFile = workspaceFile(
      "reference",
      "skills/my-skill/references/schema.md",
    );
    const scriptFile = workspaceFile(
      "script",
      "skills/my-skill/scripts/validate.js",
    );
    const files = [skillFile, referenceFile, scriptFile];
    mocks.listWorkspaceFiles.mockResolvedValue(files);
    mocks.getWorkspaceFileByPath.mockResolvedValue(skillFile);
    mocks.readWorkspaceTextFileCapped.mockImplementation(
      async (_userId: string, _workspaceId: string, fileId: string) => ({
        file: files.find((file) => file.id === fileId),
        text:
          fileId === "skill"
            ? "---\nname: my-skill\ndescription: Runs validation.\nchainRunnable: true\nentrypoint: scripts/validate.js\n---\nFollow these instructions."
            : fileId === "reference"
              ? "# Schema"
              : "console.log('ok');",
        truncated: false,
      }),
    );

    const summaries = await listDirectorySkills({
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    expect(summaries).toContainEqual(
      expect.objectContaining({
        id: "workspace.my-skill",
        name: "my-skill",
        source: "workspace",
        description: "Runs validation.",
        chainRunnable: true,
        hasEntrypoint: true,
        referenceCount: 1,
        scriptCount: 1,
      }),
    );
    const loaded = await loadDirectorySkill({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "workspace.my-skill",
    });

    expect(loaded?.instructions).toBe("Follow these instructions.");
    expect(loaded?.entrypoint).toBe("scripts/validate.js");
    expect(loaded?.references[0]).toMatchObject({
      path: "references/schema.md",
      text: "# Schema",
      truncated: false,
    });
    expect(loaded?.scripts[0]).toMatchObject({
      path: "scripts/validate.js",
      text: "console.log('ok');",
      truncated: false,
    });
  });

  it("discovers server skills from configured roots", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skills-root-"));
    try {
      process.env.BROWSER_AGENT_SKILL_ROOTS = tempRoot;
      await fs.mkdir(path.join(tempRoot, "my-skill", "references"), {
        recursive: true,
      });
      await fs.mkdir(path.join(tempRoot, "my-skill", "scripts"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tempRoot, "my-skill", "SKILL.md"),
        "---\nname: my-skill\ndescription: Server skill.\n---\nRun it.",
      );
      await fs.writeFile(
        path.join(tempRoot, "my-skill", "references", "schema.md"),
        "# Schema",
      );
      await fs.writeFile(
        path.join(tempRoot, "my-skill", "scripts", "validate.js"),
        "console.log('ok');",
      );

      const summaries = await listDirectorySkills({
        userId: "user-1",
        workspaceId: "workspace-1",
      });
      const loaded = await loadDirectorySkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "server.my-skill",
      });

      expect(summaries).toContainEqual(
        expect.objectContaining({
          id: "server.my-skill",
          source: "server",
          referenceCount: 1,
          scriptCount: 1,
        }),
      );
      expect(loaded?.references[0]?.path).toBe("references/schema.md");
      expect(loaded?.scripts[0]?.path).toBe("scripts/validate.js");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("discovers repo-local server skills from skills directories", async () => {
    const summaries = await listDirectorySkills({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    const loaded = await loadDirectorySkill({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "server.research-synthesis",
    });

    expect(summaries).toContainEqual(
      expect.objectContaining({
        id: "server.research-synthesis",
        source: "server",
        description:
          "Synthesizes supported workspace text files into a sourced Markdown summary.",
        chainRunnable: true,
      }),
    );
    expect(loaded?.instructions).toContain("Summary, Key Findings");
  });

  it("rejects invalid entrypoints and name-directory mismatches", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skills-root-"));
    try {
      process.env.BROWSER_AGENT_SKILL_ROOTS = tempRoot;
      await fs.mkdir(path.join(tempRoot, "bad-entry"), { recursive: true });
      await fs.writeFile(
        path.join(tempRoot, "bad-entry", "SKILL.md"),
        "---\nname: bad-entry\ndescription: Bad entry.\nentrypoint: ../bad.js\n---\nBad.",
      );
      await fs.mkdir(path.join(tempRoot, "wrong-name"), { recursive: true });
      await fs.writeFile(
        path.join(tempRoot, "wrong-name", "SKILL.md"),
        "---\nname: other-name\ndescription: Bad name.\n---\nBad.",
      );

      await expect(
        loadDirectorySkill({
          userId: "user-1",
          workspaceId: "workspace-1",
          skillId: "server.bad-entry",
        }),
      ).rejects.toThrow("Invalid skill entrypoint.");
      await expect(
        loadDirectorySkill({
          userId: "user-1",
          workspaceId: "workspace-1",
          skillId: "server.wrong-name",
        }),
      ).rejects.toThrow("Skill name does not match directory.");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores relative environment server roots", async () => {
    process.env.BROWSER_AGENT_SKILL_ROOTS = "relative-skills";

    const summaries = await listDirectorySkills({
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    expect(summaries).not.toContainEqual(
      expect.objectContaining({ id: "server.my-skill" }),
    );
  });

  it("does not load server skills through symlink escapes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skills-root-"));
    const outsideRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "skills-outside-"),
    );
    try {
      process.env.BROWSER_AGENT_SKILL_ROOTS = tempRoot;
      await fs.mkdir(path.join(outsideRoot, "my-skill"), { recursive: true });
      await fs.writeFile(
        path.join(outsideRoot, "my-skill", "SKILL.md"),
        "---\nname: my-skill\ndescription: Escaped skill.\n---\nRun it.",
      );
      await fs.symlink(
        path.join(outsideRoot, "my-skill"),
        path.join(tempRoot, "my-skill"),
        process.platform === "win32" ? "junction" : "dir",
      );

      await expect(
        loadDirectorySkill({
          userId: "user-1",
          workspaceId: "workspace-1",
          skillId: "server.my-skill",
        }),
      ).resolves.toBeNull();
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EPERM"
      ) {
        return;
      }
      throw error;
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("truncates oversized server references instead of rejecting the skill", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skills-root-"));
    try {
      process.env.BROWSER_AGENT_SKILL_ROOTS = tempRoot;
      await fs.mkdir(path.join(tempRoot, "big-skill", "references"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tempRoot, "big-skill", "SKILL.md"),
        "---\nname: big-skill\ndescription: Big references.\n---\nRun it.",
      );
      await fs.writeFile(
        path.join(tempRoot, "big-skill", "references", "large.md"),
        "x".repeat(MAX_SKILL_ASSET_CHARS + 1),
      );

      const loaded = await loadDirectorySkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        skillId: "server.big-skill",
      });

      expect(loaded?.references[0]?.text).toHaveLength(MAX_SKILL_ASSET_CHARS);
      expect(loaded?.references[0]?.truncated).toBe(true);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
