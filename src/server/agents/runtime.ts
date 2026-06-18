export type AgentToolCall = {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
};

export type AgentWorkspaceToolName =
  | "workspace.read_hashlines"
  | "workspace.apply_hashline_edits";

export type AgentSupplementalContext = { label: string; content: string };

export type AgentRunRequest = {
  userId: string;
  workspaceId: string;
  prompt: string;
  model?: string;
  outputPath?: string;
  supplementalContexts?: AgentSupplementalContext[];
};

export type AgentRunResult = {
  runId: string;
  status: "SUCCEEDED" | "FAILED";
  outputFileId?: string;
  errorMessage?: string;
  outputPath?: string;
};

export interface AgentRuntime {
  run(input: AgentRunRequest): Promise<AgentRunResult>;
}
