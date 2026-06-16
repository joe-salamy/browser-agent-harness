import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentRunCreate: vi.fn(),
  agentRunUpdate: vi.fn(),
  writeAuditLog: vi.fn(),
  assertWorkspaceAccess: vi.fn(),
  listAvailableSkills: vi.fn(),
  listWorkspaceFiles: vi.fn(),
  isCoreReadableText: vi.fn(),
  createWorkspaceFile: vi.fn(),
  getDefaultModelProvider: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    agentRun: {
      create: mocks.agentRunCreate,
      update: mocks.agentRunUpdate,
    },
  },
}));

vi.mock("@/server/audit/log", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/server/workspaces/access", () => ({
  assertWorkspaceAccess: mocks.assertWorkspaceAccess,
}));

vi.mock("@/server/skills/registry", () => ({
  listAvailableSkills: mocks.listAvailableSkills,
}));

vi.mock("@/server/workspaces/files", () => ({
  createWorkspaceFile: mocks.createWorkspaceFile,
  isCoreReadableText: mocks.isCoreReadableText,
  listWorkspaceFiles: mocks.listWorkspaceFiles,
}));

vi.mock("@/server/models/credentials", () => ({
  getDefaultModelProvider: mocks.getDefaultModelProvider,
}));

vi.mock("@/server/models/openrouter", () => ({
  resolveOpenRouterModel: (model?: string) => model ?? "openai/gpt-4.1-mini",
}));

import { buildSkillChainManifest } from "./builder";

const unavailableManifest = {
  version: 1,
  id: "dynamic-chain",
  name: "Dynamic Chain",
  steps: [
    {
      id: "missing-step",
      skillId: "workspace.missing",
      prompt: "Run missing skill.",
      outputPath: "chains/{{runId}}/{{stepIndex}}-missing-step.md",
    },
  ],
};

const repairedManifest = {
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
  mocks.agentRunCreate.mockResolvedValue({
    id: "run-1",
    modelName: "openai/gpt-4.1-mini",
  });
  mocks.agentRunUpdate.mockResolvedValue({});
  mocks.writeAuditLog.mockResolvedValue({});
  mocks.assertWorkspaceAccess.mockResolvedValue({ instructions: "" });
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
  mocks.listWorkspaceFiles.mockResolvedValue([]);
  mocks.isCoreReadableText.mockReturnValue(true);
  mocks.createWorkspaceFile.mockResolvedValue({
    id: "manifest-file-1",
    path: "chains/manifests/dynamic-chain.json",
  });
  mocks.getDefaultModelProvider.mockResolvedValue({
    provider: "OPENROUTER",
    adapter: { generateText: mocks.generateText },
  });
  mocks.generateText
    .mockResolvedValueOnce({
      text: JSON.stringify(unavailableManifest),
      rawUsage: { totalTokens: 10 },
    })
    .mockResolvedValueOnce({
      text: JSON.stringify(repairedManifest),
      rawUsage: { totalTokens: 12 },
    });
});

describe("chain builder dynamic skill repair", () => {
  it("repairs unavailable skill ids before storing the manifest", async () => {
    const result = await buildSkillChainManifest({
      userId: "user-1",
      workspaceId: "workspace-1",
      prompt: "Build a chain.",
      outputPath: "chains/manifests/dynamic-chain.json",
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.generateText.mock.calls[1][0].messages)).toContain(
      "Skill workspace.missing is not in allowed executable skill IDs.",
    );
    const persistedManifest = JSON.parse(
      mocks.createWorkspaceFile.mock.calls[0][0].bytes.toString("utf8"),
    );
    expect(persistedManifest.steps[0].skillId).toBe("workspace.my-skill");
  });
});
