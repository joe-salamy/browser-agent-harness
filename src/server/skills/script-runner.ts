import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { writeAuditLog } from "@/server/audit/log";

export type SkillScriptRunInput = {
  userId: string;
  workspaceId: string;
  skillId: string;
  skillName: string;
  entrypoint: string;
  files: Array<{ path: string; bytes: Buffer; contentType: string }>;
  prompt: string;
};

export type SkillScriptRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
};

export const SKILL_SCRIPT_TIMEOUT_MS = 30_000;
export const MAX_SKILL_SCRIPT_OUTPUT_CHARS = 20_000;

const TRUNCATED_MARKER = "…[truncated]";

function appendCappedOutput(current: string, chunk: string): string {
  if (current.endsWith(TRUNCATED_MARKER)) return current;
  const remaining = MAX_SKILL_SCRIPT_OUTPUT_CHARS - current.length;
  if (chunk.length <= remaining) return current + chunk;
  return `${current}${chunk.slice(0, Math.max(0, remaining))}${TRUNCATED_MARKER}`;
}

function commandForEntrypoint(entrypoint: string): { command: string; args: string[] } {
  switch (path.extname(entrypoint)) {
    case ".js":
      return { command: process.execPath, args: [entrypoint] };
    case ".sh":
      return { command: process.env.BASH_BIN ?? "bash", args: [entrypoint] };
    case ".py":
      return { command: process.env.PYTHON_BIN ?? "python", args: [entrypoint] };
    default:
      throw new Error("Unsupported skill entrypoint extension.");
  }
}

function safeRelativePath(inputPath: string): string {
  const normalized = path.posix.normalize(inputPath.replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.split("/").includes("..") ||
    path.isAbsolute(inputPath)
  ) {
    throw new Error("Invalid skill script file path.");
  }
  return normalized;
}

async function materializeFiles(
  tempDir: string,
  files: Array<{ path: string; bytes: Buffer }>,
): Promise<void> {
  for (const file of files) {
    const relativePath = safeRelativePath(file.path);
    const absolutePath = path.join(tempDir, ...relativePath.split("/"));
    const relativeToTemp = path.relative(tempDir, absolutePath);
    if (relativeToTemp.startsWith("..") || path.isAbsolute(relativeToTemp)) {
      throw new Error("Invalid skill script file path.");
    }
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.bytes);
  }
}

export async function runSkillEntrypoint(
  input: SkillScriptRunInput,
): Promise<SkillScriptRunResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-"));
  const startedAt = Date.now();
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    eventType: "skill.script.started",
    targetType: "skill",
    targetId: input.skillId,
    summary: `Started skill script ${input.entrypoint}.`,
    metadata: { skillId: input.skillId, entrypoint: input.entrypoint },
  });
  try {
    await materializeFiles(tempDir, input.files);
    const entrypointRelativePath = safeRelativePath(input.entrypoint);
    const entrypointAbsolutePath = path.join(
      tempDir,
      ...entrypointRelativePath.split("/"),
    );
    const command = commandForEntrypoint(entrypointAbsolutePath);
    const result = await new Promise<
      SkillScriptRunResult & { stdoutBytes: number; stderrBytes: number }
    >((resolve) => {
      const child: ChildProcessWithoutNullStreams = spawn(
        command.command,
        command.args,
        {
          cwd: tempDir,
          env: {
            PATH: process.env.PATH ?? "",
            PYTHONIOENCODING: "utf-8",
          } as unknown as NodeJS.ProcessEnv,
        },
      );
      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, SKILL_SCRIPT_TIMEOUT_MS);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBytes += Buffer.byteLength(chunk, "utf8");
        stdout = appendCappedOutput(stdout, chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderrBytes += Buffer.byteLength(chunk, "utf8");
        stderr = appendCappedOutput(stderr, chunk);
      });
      child.on("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          stdoutBytes,
          stderrBytes,
          exitCode: -1,
          timedOut: false,
          durationMs: Date.now() - startedAt,
        });
      });
      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          stdoutBytes,
          stderrBytes,
          exitCode: code ?? -1,
          timedOut,
          durationMs: Date.now() - startedAt,
        });
      });
      child.stdin.end(
        JSON.stringify({
          skillId: input.skillId,
          skillName: input.skillName,
          prompt: input.prompt,
        }),
      );
    });
    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      eventType: "skill.script.finished",
      targetType: "skill",
      targetId: input.skillId,
      summary: `Finished skill script ${input.entrypoint}.`,
      metadata: {
        skillId: input.skillId,
        entrypoint: input.entrypoint,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdoutBytes: result.stdoutBytes,
        stderrBytes: result.stderrBytes,
      },
    });
    return result;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
