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
          startTransition(
            () =>
              void submit(
                `/api/workspaces/${workspaceId}/agent-runs`,
                formData,
              ),
          );
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
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Running..." : "Run agent"}
        </button>
      </form>

      <form
        className="grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const skillId = String(formData.get("skillId") ?? "");
          if (!skillId) {
            setError("Select a skill.");
            return;
          }
          formData.delete("skillId");
          startTransition(
            () =>
              void submit(
                `/api/workspaces/${workspaceId}/skills/${encodeURIComponent(skillId)}`,
                formData,
              ),
          );
        }}
      >
        <label>
          Skill
          <select className="input" name="skillId" required>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.id} — {skill.description}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prompt
          <textarea
            className="input"
            name="prompt"
            placeholder="Optional skill task"
            rows={4}
          />
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
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input name="allowScripts" type="checkbox" />
          Allow scripts for skills with entrypoints
        </label>
        <button
          className="btn secondary"
          type="submit"
          disabled={isPending || skills.length === 0}
        >
          {isPending ? "Running..." : "Run selected skill"}
        </button>
        {skills.length === 0 ? (
          <p className="muted">No skills are available.</p>
        ) : null}
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
            <span style={{ color: "#b91c1c" }}>{result.errorMessage}</span>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
