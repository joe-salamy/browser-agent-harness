import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/server/audit/log", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

import {
  MAX_SKILL_SCRIPT_OUTPUT_CHARS,
  runSkillEntrypoint,
} from "./script-runner";

const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://secret";
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("skill script runner", () => {
  it("runs a js entrypoint with stdin JSON and a stripped environment", async () => {
    const result = await runSkillEntrypoint({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "workspace.my-skill",
      skillName: "my-skill",
      entrypoint: "scripts/validate.js",
      prompt: "Use the schema.",
      files: [
        {
          path: "scripts/validate.js",
          contentType: "text/javascript",
          bytes: Buffer.from(
            "process.stdin.setEncoding('utf8');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const parsed=JSON.parse(input);console.log(`script-ok:${parsed.skillId}:${parsed.skillName}:${parsed.prompt}`);console.error(process.env.DATABASE_URL ? 'leaked' : 'clean');});",
            "utf8",
          ),
        },
      ],
    });

    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.stdout).toContain(
      "script-ok:workspace.my-skill:my-skill:Use the schema.",
    );
    expect(result.stderr).toContain("clean");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "skill.script.started",
        metadata: {
          skillId: "workspace.my-skill",
          entrypoint: "scripts/validate.js",
        },
      }),
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "skill.script.finished",
        metadata: expect.objectContaining({
          skillId: "workspace.my-skill",
          entrypoint: "scripts/validate.js",
          exitCode: 0,
          timedOut: false,
        }),
      }),
    );
  });

  it("returns non-zero status without including output in audit metadata", async () => {
    const result = await runSkillEntrypoint({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "workspace.fail-skill",
      skillName: "fail-skill",
      entrypoint: "scripts/fail.js",
      prompt: "Fail.",
      files: [
        {
          path: "scripts/fail.js",
          contentType: "text/javascript",
          bytes: Buffer.from(
            "console.log('stdout-secret');console.error('stderr-secret');process.exit(7);",
            "utf8",
          ),
        },
      ],
    });

    expect(result.exitCode).toBe(7);
    expect(result.stdout).toContain("stdout-secret");
    expect(result.stderr).toContain("stderr-secret");
    const finishCall = mocks.writeAuditLog.mock.calls.find(
      ([input]) => input.eventType === "skill.script.finished",
    );
    expect(finishCall?.[0].metadata).toEqual(
      expect.objectContaining({ exitCode: 7, timedOut: false }),
    );
    expect(JSON.stringify(finishCall?.[0].metadata)).not.toContain("secret");
  });

  it("truncates stdout and stderr independently", async () => {
    const result = await runSkillEntrypoint({
      userId: "user-1",
      workspaceId: "workspace-1",
      skillId: "workspace.big-skill",
      skillName: "big-skill",
      entrypoint: "scripts/big.js",
      prompt: "Big.",
      files: [
        {
          path: "scripts/big.js",
          contentType: "text/javascript",
          bytes: Buffer.from(
            `console.log('x'.repeat(${MAX_SKILL_SCRIPT_OUTPUT_CHARS + 1}));console.error('y'.repeat(${MAX_SKILL_SCRIPT_OUTPUT_CHARS + 1}));`,
            "utf8",
          ),
        },
      ],
    });

    expect(result.stdout).toContain("…[truncated]");
    expect(result.stderr).toContain("…[truncated]");
    expect(result.stdout.length).toBeLessThanOrEqual(
      MAX_SKILL_SCRIPT_OUTPUT_CHARS + "…[truncated]".length,
    );
    expect(result.stderr.length).toBeLessThanOrEqual(
      MAX_SKILL_SCRIPT_OUTPUT_CHARS + "…[truncated]".length,
    );
    const finishCall = mocks.writeAuditLog.mock.calls.find(
      ([input]) => input.eventType === "skill.script.finished",
    );
    expect(finishCall?.[0].metadata).toEqual(
      expect.objectContaining({
        stdoutBytes: expect.any(Number),
        stderrBytes: expect.any(Number),
      }),
    );
  });
});
