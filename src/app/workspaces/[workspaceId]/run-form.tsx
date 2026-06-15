"use client";

import { useState, useTransition } from "react";

type RunResult = { runId: string; status: "SUCCEEDED" | "FAILED"; outputFileId?: string; errorMessage?: string };

export function RunForm({ workspaceId }: { workspaceId: string }) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(path: string, formData: FormData) {
    setError(null);
    setResult(null);
    const response = await fetch(path, { method: "POST", body: formData });
    const body = (await response.json()) as RunResult & { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Run failed.");
      return;
    }
    setResult(body);
    window.dispatchEvent(new Event("workspace-updated"));
  }

  return (
    <div className="grid">
      <form
        className="grid"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => void submit(`/api/workspaces/${workspaceId}/agent-runs`, formData));
        }}
      >
        <label>
          Prompt
          <textarea className="input" name="prompt" required rows={5} />
        </label>
        <label>
          Model
          <input className="input" name="model" defaultValue="openai/gpt-4.1-mini" />
        </label>
        <button className="btn" type="submit" disabled={isPending}>{isPending ? "Running..." : "Run agent"}</button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => void submit(`/api/workspaces/${workspaceId}/skills/core.research-synthesis`, formData));
        }}
      >
        <input className="input" name="prompt" placeholder="Optional skill focus" />
        <button className="btn secondary" type="submit" disabled={isPending} style={{ marginTop: 8 }}>Run Research Synthesis skill</button>
      </form>

      {result ? (
        <p>
          Status: <strong>{result.status}</strong>{" "}
          {result.outputFileId ? <a className="badge" href={`/workspaces/${workspaceId}?fileId=${result.outputFileId}`}>Open output file</a> : null}
          {result.errorMessage ? <span style={{ color: "#b91c1c" }}>{result.errorMessage}</span> : null}
        </p>
      ) : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </div>
  );
}
