"use client";

import { useState, useTransition } from "react";
import type { SkillSummary } from "@/server/skills/directory";

type RunResult = {
  runId: string;
  status: "SUCCEEDED" | "FAILED";
  outputFileId?: string;
  errorMessage?: string;
};

export function RunForm({
  workspaceId,
  skills,
}: {
  workspaceId: string;
  skills: SkillSummary[];
}) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(formData: FormData) {
    setError(null);
    setResult(null);
    const response = await fetch(`/api/workspaces/${workspaceId}/agent-runs`, {
      method: "POST",
      body: formData,
    });
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
          startTransition(() => void submit(formData));
        }}
      >
        <label>
          Prompt
          <textarea className="input" name="prompt" required rows={5} />
        </label>
        <label>
          Model
          <input
            className="input"
            name="model"
            defaultValue="openai/gpt-4.1-mini"
          />
        </label>
        <label>
          Output path
          <input
            className="input"
            name="outputPath"
            placeholder="Optional workspace output path"
          />
        </label>
        <fieldset className="grid">
          <legend>Skills</legend>
          {skills.map((skill) => (
            <label key={skill.id} className="check-row">
              <input type="checkbox" name="skillIds" value={skill.id} />
              <span>
                {skill.id} — {skill.description}
              </span>
            </label>
          ))}
          {skills.length === 0 ? (
            <p className="muted">No skills are available.</p>
          ) : null}
        </fieldset>
        <label className="check-row">
          <input name="allowScripts" type="checkbox" />
          Allow scripts for skills with entrypoints
        </label>
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Running..." : "Run agent"}
        </button>
      </form>

      {result ? (
        <p>
          Status: <strong>{result.status}</strong>{" "}
          {result.outputFileId ? (
            <a
              className="badge"
              href={`/workspaces/${workspaceId}?fileId=${result.outputFileId}`}
            >
              Open output file
            </a>
          ) : null}
          {result.errorMessage ? (
            <span className="error-text">{result.errorMessage}</span>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
