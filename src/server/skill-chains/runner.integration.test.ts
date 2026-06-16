import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  createWorkspaceFile,
  getWorkspaceFileByPath,
  readWorkspaceTextFile,
} from "@/server/workspaces/files";
import { runSkillChain, type SkillChainStepExecutor } from "./runner";
import type { SkillChainManifest, SkillChainState } from "./types";

const dbDescribe = process.env.DATABASE_URL ? describe : describe.skip;

dbDescribe("skill chain runner persistence", () => {
  it("runs a three-step manifest and passes prior artifacts", async () => {
    const { userId, workspaceId } = await createFixture("chain-success");
    const manifest = makeManifest("chain-success");
    const previousArtifactsByStep = new Map<
      string,
      Array<{ stepId: string; path: string; fileId: string }>
    >();
    const executeStep: SkillChainStepExecutor = async (input) => {
      previousArtifactsByStep.set(input.stepId, input.previousArtifacts);
      const file = await createWorkspaceFile({
        userId: input.userId,
        workspaceId: input.workspaceId,
        path: input.outputPath,
        bytes: Buffer.from(`Output for ${input.stepId}`),
        contentType: "text/markdown",
      });
      return {
        status: "SUCCEEDED",
        outputFileId: file.id,
        outputPath: file.path,
      };
    };

    const result = await runSkillChain({
      userId,
      workspaceId,
      manifest,
      initialInput: "Evaluate a browser-native agent harness.",
      executeStep,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.currentStepIndex).toBe(3);
    expect(previousArtifactsByStep.get("planning")?.[0]?.stepId).toBe(
      "market-research",
    );
    const state = await readState(userId, workspaceId, result.statePath);
    expect(state.status).toBe("SUCCEEDED");
    for (const step of result.steps) {
      expect(step.status).toBe("SUCCEEDED");
      expect(step.outputFileId).toBeTruthy();
      await expect(
        getWorkspaceFileByPath(userId, workspaceId, step.outputPath),
      ).resolves.toBeTruthy();
    }
  });

  it("persists failure and resumes without rerunning completed steps", async () => {
    const { userId, workspaceId } = await createFixture("chain-resume");
    const manifest = makeManifest("chain-resume");
    const calls = new Map<string, number>();
    let failPlanning = true;
    const executeStep: SkillChainStepExecutor = async (input) => {
      calls.set(input.stepId, (calls.get(input.stepId) ?? 0) + 1);
      if (input.stepId === "planning" && failPlanning) {
        return { status: "FAILED", errorMessage: "Planning failed." };
      }
      const file = await createWorkspaceFile({
        userId: input.userId,
        workspaceId: input.workspaceId,
        path: input.outputPath,
        bytes: Buffer.from(`Output for ${input.stepId}`),
        contentType: "text/markdown",
      });
      return {
        status: "SUCCEEDED",
        outputFileId: file.id,
        outputPath: file.path,
      };
    };

    const failed = await runSkillChain({
      userId,
      workspaceId,
      manifest,
      initialInput: "Evaluate a browser-native agent harness.",
      executeStep,
    });

    expect(failed.status).toBe("FAILED");
    expect(failed.steps[0]?.status).toBe("SUCCEEDED");
    expect(failed.steps[1]?.status).toBe("FAILED");
    expect(failed.steps[2]?.status).toBe("PENDING");
    const stepOneOutput = failed.steps[0]?.outputFileId;

    failPlanning = false;
    const resumed = await runSkillChain({
      userId,
      workspaceId,
      resumeStatePath: failed.statePath,
      executeStep,
    });

    expect(resumed.status).toBe("SUCCEEDED");
    expect(resumed.steps[0]?.outputFileId).toBe(stepOneOutput);
    expect(calls.get("market-research")).toBe(1);
    expect(calls.get("planning")).toBe(2);
    expect(calls.get("implementation-brief")).toBe(1);
    const state = await readState(userId, workspaceId, resumed.statePath);
    expect(state.status).toBe("SUCCEEDED");
  });

  it("prechecks rendered output path collisions before executing steps", async () => {
    const { userId, workspaceId } = await createFixture(
      "chain-output-collision",
    );
    const manifest = makeManifest("chain-output-collision");
    manifest.steps[0].outputPath = `chains/${manifest.id}/{{runId}}/{{stepIndex}}-shared.md`;
    manifest.steps[1].outputPath = `chains/${manifest.id}/{{runId}}/01-shared.md`;
    let callCount = 0;
    const executeStep: SkillChainStepExecutor = async (input) => {
      callCount += 1;
      const file = await createWorkspaceFile({
        userId: input.userId,
        workspaceId: input.workspaceId,
        path: input.outputPath,
        bytes: Buffer.from(`Output for ${input.stepId}`),
        contentType: "text/markdown",
      });
      return {
        status: "SUCCEEDED",
        outputFileId: file.id,
        outputPath: file.path,
      };
    };

    await expect(
      runSkillChain({
        userId,
        workspaceId,
        manifest,
        initialInput: "Evaluate a browser-native agent harness.",
        executeStep,
      }),
    ).rejects.toThrow("Duplicate skill chain output path");
    expect(callCount).toBe(0);
  });
});

function makeManifest(id: string): SkillChainManifest {
  return {
    version: 1,
    id,
    name: `Manifest ${id}`,
    steps: [
      {
        id: "market-research",
        skillId: "core.research-synthesis",
        prompt: "Research the idea.",
        outputPath: `chains/${id}/{{runId}}/{{stepIndex}}-market-research.md`,
      },
      {
        id: "planning",
        skillId: "core.research-synthesis",
        prompt: "Plan the work.",
        outputPath: `chains/${id}/{{runId}}/{{stepIndex}}-planning.md`,
      },
      {
        id: "implementation-brief",
        skillId: "core.research-synthesis",
        prompt: "Write implementation instructions.",
        outputPath: `chains/${id}/{{runId}}/{{stepIndex}}-implementation-brief.md`,
      },
    ],
  };
}

async function readState(
  userId: string,
  workspaceId: string,
  statePath: string,
): Promise<SkillChainState> {
  const stateFile = await getWorkspaceFileByPath(
    userId,
    workspaceId,
    statePath,
  );
  if (!stateFile) throw new Error("State file missing.");
  const { text } = await readWorkspaceTextFile(
    userId,
    workspaceId,
    stateFile.id,
  );
  return JSON.parse(text) as SkillChainState;
}

async function createFixture(
  label: string,
): Promise<{ userId: string; workspaceId: string }> {
  const email = `${label}-${crypto.randomUUID()}@example.com`;
  const user = await prisma.user.create({ data: { email } });
  const workspace = await prisma.workspace.create({
    data: {
      ownerId: user.id,
      name: `Fixture ${label}`,
      members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
    },
  });
  return { userId: user.id, workspaceId: workspace.id };
}
