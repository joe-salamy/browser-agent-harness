"use client";

import { useState, useTransition } from "react";
import { SkillChainResultPanel } from "./skill-chain-result-panel";
import type { BuildManifestResult } from "./types";

type ManifestBuilderFormProps = {
  workspaceId: string;
  canEdit: boolean;
  result: BuildManifestResult | null;
  onResult: (result: BuildManifestResult | null) => void;
  onUseManifest: (manifestPath: string, initialInput: string) => void;
};

type PendingAction = "create" | "preview" | null;

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function bodyError(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const { error } = body as { error?: unknown };
  return typeof error === "string" ? error : undefined;
}

export function ManifestBuilderForm({
  workspaceId,
  canEdit,
  result,
  onResult,
  onUseManifest,
}: ManifestBuilderFormProps) {
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

  async function importGoalFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setGoal(await file.text());
      setImportedFileName(file.name);
    } catch {
      setImportedFileName(null);
      setError("Could not read goal file.");
    }
  }

  async function submit(dryRun: boolean) {
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) {
      setError("Goal is required.");
      return;
    }

    setError(null);
    onResult(null);
    setPendingAction(dryRun ? "preview" : "create");
    const trimmedModel = model.trim();
    const trimmedOutputPath = outputPath.trim();
    const body: Record<string, unknown> = {
      prompt: trimmedGoal,
      dryRun,
    };
    if (trimmedModel) body.model = trimmedModel;
    if (trimmedOutputPath) body.outputPath = trimmedOutputPath;

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/skill-chain-manifests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const responseBody = await responseJson(response);
      if (!response.ok) {
        setError(
          bodyError(responseBody) ?? "Skill chain manifest creation failed.",
        );
        return;
      }
      onResult(responseBody as BuildManifestResult);
      if (!dryRun) window.dispatchEvent(new Event("workspace-updated"));
    } catch {
      setError("Skill chain manifest creation failed.");
    } finally {
      setPendingAction(null);
    }
  }

  const disabled = pendingAction !== null || isPending || !canEdit;

  return (
    <section className="card">
      <h2>Create manifest</h2>
      <p className="muted">
        Only chain-runnable skills can be used as chain steps.
        server.chain-builder authors manifests and is not offered as an
        executable step.
      </p>
      {!canEdit ? (
        <p className="muted">Editor access is required to create manifests.</p>
      ) : null}
      <form
        className="grid"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => void submit(false));
        }}
      >
        <label>
          Goal
          <textarea
            className="input"
            name="goal"
            required
            rows={6}
            value={goal}
            onChange={(event) => setGoal(event.currentTarget.value)}
          />
        </label>
        <label>
          Import goal file
          <input
            className="input"
            name="goalFile"
            type="file"
            onChange={(event) =>
              void importGoalFile(event.currentTarget.files?.[0])
            }
          />
        </label>
        {importedFileName ? (
          <p className="muted">Imported {importedFileName}</p>
        ) : null}
        <label>
          Model
          <input
            className="input"
            name="model"
            placeholder="openai/gpt-4.1-mini"
            value={model}
            onChange={(event) => setModel(event.currentTarget.value)}
          />
        </label>
        <label>
          Manifest output path
          <input
            className="input"
            name="outputPath"
            placeholder="chains/manifests/my-chain.json"
            value={outputPath}
            onChange={(event) => setOutputPath(event.currentTarget.value)}
          />
        </label>
        <div className="grid two">
          <button className="btn" type="submit" disabled={disabled}>
            {pendingAction === "create" ? "Creating..." : "Create manifest"}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={disabled}
            onClick={() => startTransition(() => void submit(true))}
          >
            {pendingAction === "preview"
              ? "Previewing..."
              : "Preview manifest creation"}
          </button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
      <SkillChainResultPanel
        title="Manifest result"
        workspaceId={workspaceId}
        result={result}
        canEdit={canEdit}
        onUseManifest={(manifestPath) => onUseManifest(manifestPath, goal)}
      />
    </section>
  );
}
