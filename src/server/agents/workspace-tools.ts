import {
  applyWorkspaceHashlineEdits,
  readWorkspaceHashlines,
} from "@/server/agents/hashline-workspace-tools";
import type { HashlineEditOperation } from "@/server/agents/hashline-core";
import type { AgentWorkspaceToolName } from "@/server/agents/runtime";

export class UnknownAgentToolError extends Error {
  constructor() {
    super("Unknown agent workspace tool.");
    this.name = "UnknownAgentToolError";
  }
}

export async function runWorkspaceTool(input: {
  userId: string;
  workspaceId: string;
  runId: string;
  name: AgentWorkspaceToolName;
  input: unknown;
}): Promise<unknown> {
  switch (input.name) {
    case "workspace.read_hashlines": {
      const toolInput = parseReadHashlinesInput(input.input);
      return readWorkspaceHashlines({
        userId: input.userId,
        workspaceId: input.workspaceId,
        fileId: toolInput.fileId,
        startLine: toolInput.startLine,
        endLine: toolInput.endLine,
        maxLines: toolInput.maxLines ?? 300,
      });
    }
    case "workspace.apply_hashline_edits": {
      const toolInput = parseApplyHashlineEditsInput(input.input);
      return applyWorkspaceHashlineEdits({
        userId: input.userId,
        workspaceId: input.workspaceId,
        fileId: toolInput.fileId,
        tag: toolInput.tag,
        baseVersionId: toolInput.baseVersionId,
        baseVersionSha256: toolInput.baseVersionSha256,
        operations: toolInput.operations,
        createdByRunId: input.runId,
      });
    }
  }
  throw new UnknownAgentToolError();
}

type ReadHashlinesInput = {
  fileId: string;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
};

type ApplyHashlineEditsInput = {
  fileId: string;
  tag: string;
  baseVersionId: string;
  baseVersionSha256: string;
  operations: HashlineEditOperation[];
};

function parseReadHashlinesInput(input: unknown): ReadHashlinesInput {
  if (!input || typeof input !== "object") throw new Error("Invalid tool input.");
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.fileId !== "string") throw new Error("Invalid tool input.");
  return {
    fileId: candidate.fileId,
    startLine: optionalNumber(candidate.startLine),
    endLine: optionalNumber(candidate.endLine),
    maxLines: optionalNumber(candidate.maxLines),
  };
}

function parseApplyHashlineEditsInput(input: unknown): ApplyHashlineEditsInput {
  if (!input || typeof input !== "object") throw new Error("Invalid tool input.");
  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.fileId !== "string" ||
    typeof candidate.tag !== "string" ||
    typeof candidate.baseVersionId !== "string" ||
    typeof candidate.baseVersionSha256 !== "string" ||
    !Array.isArray(candidate.operations)
  ) {
    throw new Error("Invalid tool input.");
  }
  return {
    fileId: candidate.fileId,
    tag: candidate.tag,
    baseVersionId: candidate.baseVersionId,
    baseVersionSha256: candidate.baseVersionSha256,
    operations: candidate.operations as HashlineEditOperation[],
  };
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw new Error("Invalid tool input.");
  return value;
}
