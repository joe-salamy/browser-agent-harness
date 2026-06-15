import { AgentRunStatus, ModelProvider, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/server/audit/log";
import type { AgentRunRequest, AgentRunResult, AgentRuntime } from "@/server/agents/runtime";
import { getDefaultModelProvider } from "@/server/models/credentials";
import { DEFAULT_OPENROUTER_MODEL } from "@/server/models/openrouter";
import { createWorkspaceFile, isCoreReadableText, listWorkspaceFiles, readWorkspaceTextFile } from "@/server/workspaces/files";
import { assertWorkspaceAccess } from "@/server/workspaces/access";

const SYSTEM_PROMPT =
  "You are a domain-neutral knowledge-work agent. Use only the provided workspace context. Produce concise, sourced work product. Do not claim unsupported files were read.";
const MAX_INLINE_CONTEXT_CHARS = 80_000;

export class MinimalAgentRuntime implements AgentRuntime {
  async run(input: AgentRunRequest): Promise<AgentRunResult> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("Prompt is required.");
    const workspace = await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.EDITOR);
    const run = await prisma.agentRun.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.userId,
        status: AgentRunStatus.RUNNING,
        prompt,
        modelProvider: ModelProvider.OPENROUTER,
        modelName: input.model?.trim() || DEFAULT_OPENROUTER_MODEL,
      },
    });

    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      agentRunId: run.id,
      eventType: "agent.run.started",
      targetType: "agentRun",
      targetId: run.id,
      summary: "Started agent run.",
      metadata: { model: run.modelName },
    });

    try {
      const files = await listWorkspaceFiles(input.userId, input.workspaceId);
      const fileTree = files.map((file) => {
        const readable = isCoreReadableText(file.path, file.contentType) ? "core text-readable" : "stored but not text-readable by core";
        return `- ${file.path} (${file.contentType}, ${file.sizeBytes} bytes, ${readable})`;
      });
      const contentBlocks: string[] = [];
      let usedChars = 0;
      let truncated = false;

      for (const file of files) {
        if (!isCoreReadableText(file.path, file.contentType)) continue;
        const { text } = await readWorkspaceTextFile(input.userId, input.workspaceId, file.id);
        const header = `\n\n--- FILE: ${file.path} ---\n`;
        const remaining = MAX_INLINE_CONTEXT_CHARS - usedChars - header.length;
        if (remaining <= 0) {
          truncated = true;
          break;
        }
        const slice = text.length > remaining ? text.slice(0, remaining) : text;
        contentBlocks.push(`${header}${slice}`);
        usedChars += header.length + slice.length;
        if (slice.length < text.length) {
          truncated = true;
          break;
        }
      }

      const userContext = [
        `Workspace instructions:\n${workspace.instructions || "(none)"}`,
        `User prompt:\n${prompt}`,
        `File tree:\n${fileTree.join("\n") || "(no files)"}`,
        `Readable file context:${contentBlocks.join("") || "\n(no readable text files)"}`,
        truncated ? "Context truncated after 80000 characters." : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const provider = await getDefaultModelProvider(input.userId, input.workspaceId);
      const modelName = input.model?.trim() || provider.model;
      const result = await provider.adapter.generateText({
        model: modelName,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContext },
        ],
      });

      await writeAuditLog({
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        agentRunId: run.id,
        eventType: "agent.model.called",
        targetType: "agentRun",
        targetId: run.id,
        summary: "Called default model provider.",
        metadata: { provider: provider.provider, model: modelName, truncated, rawUsage: result.rawUsage },
      });

      const date = new Date().toISOString().slice(0, 10);
      const output = await createWorkspaceFile({
        userId: input.userId,
        workspaceId: input.workspaceId,
        path: `outputs/${date}-${run.id}.md`,
        bytes: Buffer.from(result.text, "utf8"),
        contentType: "text/markdown",
        createdByRunId: run.id,
      });

      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: AgentRunStatus.SUCCEEDED,
          modelName,
          outputFileId: output.id,
          completedAt: new Date(),
        },
      });

      await writeAuditLog({
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        agentRunId: run.id,
        eventType: "agent.output.created",
        targetType: "file",
        targetId: output.id,
        summary: `Created output ${output.path}.`,
        metadata: { path: output.path },
      });
      await writeAuditLog({
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        agentRunId: run.id,
        eventType: "agent.run.succeeded",
        targetType: "agentRun",
        targetId: run.id,
        summary: "Agent run succeeded.",
        metadata: { outputFileId: output.id, truncated },
      });

      return { runId: run.id, status: "SUCCEEDED", outputFileId: output.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Agent run failed.";
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: AgentRunStatus.FAILED, failedAt: new Date(), errorMessage },
      });
      await writeAuditLog({
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        agentRunId: run.id,
        eventType: "agent.run.failed",
        targetType: "agentRun",
        targetId: run.id,
        summary: "Agent run failed.",
        metadata: { message: errorMessage },
      });
      return { runId: run.id, status: "FAILED", errorMessage };
    }
  }
}

export const minimalAgentRuntime = new MinimalAgentRuntime();
