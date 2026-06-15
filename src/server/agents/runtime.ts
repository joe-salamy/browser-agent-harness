export type AgentToolCall = { name: string; input: unknown; output?: unknown; error?: string };

export type AgentRunRequest = { userId: string; workspaceId: string; prompt: string; model?: string };

export type AgentRunResult = {
  runId: string;
  status: "SUCCEEDED" | "FAILED";
  outputFileId?: string;
  errorMessage?: string;
};

export interface AgentRuntime {
  run(input: AgentRunRequest): Promise<AgentRunResult>;
}
