"use client";

import { useState, useTransition } from "react";
import { SkillChainResultPanel } from "./skill-chain-result-panel";
import type {
  AutomationFileOption,
  ManifestSource,
  RunMode,
  SkillChainUiResult,
} from "./types";

type SkillChainRunFormProps = {
  workspaceId: string;
  files: AutomationFileOption[];
  canEdit: boolean;
  result: SkillChainUiResult | null;
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  manifestSource: ManifestSource;
  onManifestSourceChange: (source: ManifestSource) => void;
  manifestPath: string;
  onManifestPathChange: (path: string) => void;
  initialInput: string;
  onInitialInputChange: (input: string) => void;
  resumeStatePath: string;
  onResumeStatePathChange: (path: string) => void;
  allowScripts: boolean;
  onAllowScriptsChange: (allowScripts: boolean) => void;
  onResult: (result: SkillChainUiResult | null) => void;
};

type PendingAction = "run" | "resume" | "preview" | null;

async function readResponseJson(response: Response): Promise<unknown> {
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

export function SkillChainRunForm({
  workspaceId,
  files,
  canEdit,
  result,
  mode,
  onModeChange,
  manifestSource,
  onManifestSourceChange,
  manifestPath,
  onManifestPathChange,
  initialInput,
  onInitialInputChange,
  resumeStatePath,
  onResumeStatePathChange,
  allowScripts,
  onAllowScriptsChange,
  onResult,
}: SkillChainRunFormProps) {
  const [manifestJson, setManifestJson] = useState("");
  const [manifestFileName, setManifestFileName] = useState<string | null>(null);
  const [initialInputFileName, setInitialInputFileName] = useState<
    string | null
  >(null);
  const [manifestFileId, setManifestFileId] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

  async function importTextFile(
    file: File | undefined,
    onText: (text: string) => void,
    onName: (name: string | null) => void,
    failureMessage: string,
  ) {
    if (!file) return;
    setError(null);
    try {
      onText(await file.text());
      onName(file.name);
    } catch {
      onName(null);
      setError(failureMessage);
    }
  }

  function updateMode(nextMode: RunMode) {
    onModeChange(nextMode);
    if (nextMode === "new" && manifestSource === "none") {
      onManifestSourceChange("json");
    }
  }

  function addManifestSource(body: Record<string, unknown>): boolean {
    if (manifestSource === "none") return true;
    if (manifestSource === "json") {
      const trimmedJson = manifestJson.trim();
      if (!trimmedJson) return true;
      try {
        body.manifest = JSON.parse(trimmedJson) as unknown;
        return true;
      } catch {
        setError("Manifest JSON is invalid.");
        return false;
      }
    }
    if (manifestSource === "workspacePath") {
      const trimmedManifestPath = manifestPath.trim();
      if (trimmedManifestPath) body.manifestPath = trimmedManifestPath;
      return true;
    }
    if (manifestFileId) body.manifestFileId = manifestFileId;
    return true;
  }

  async function submit(dryRun: boolean) {
    setError(null);
    onResult(null);
    const body: Record<string, unknown> = {};
    if (!addManifestSource(body)) return;

    const trimmedModel = model.trim();
    if (trimmedModel) body.model = trimmedModel;
    if (mode === "new") {
      const trimmedInitialInput = initialInput.trim();
      if (trimmedInitialInput) body.initialInput = trimmedInitialInput;
    } else {
      const trimmedResumeStatePath = resumeStatePath.trim();
      if (trimmedResumeStatePath) body.resumeStatePath = trimmedResumeStatePath;
    }
    if (allowScripts) body.allowScripts = true;
    if (dryRun) body.dryRun = true;

    setPendingAction(dryRun ? "preview" : mode === "resume" ? "resume" : "run");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/skill-chains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await readResponseJson(response);
      if (!response.ok) {
        setError(bodyError(responseBody) ?? "Skill chain run failed.");
        return;
      }
      onResult(responseBody as SkillChainUiResult);
      if (!dryRun) window.dispatchEvent(new Event("workspace-updated"));
    } catch {
      setError("Skill chain run failed.");
    } finally {
      setPendingAction(null);
    }
  }

  const disabled = pendingAction !== null || isPending || !canEdit;
  const selectedSource =
    mode === "new" && manifestSource === "none" ? "json" : manifestSource;

  return (
    <section className="card">
      <h2>Run or resume skill chain</h2>
      <p className="muted">
        Only chain-runnable skills can be used as chain steps.
        server.chain-builder authors manifests and is not offered as an
        executable step.
      </p>
      {!canEdit ? (
        <p className="muted">Editor access is required to run skill chains.</p>
      ) : null}
      <form
        className="grid"
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          startTransition(
            () => void submit(submitter?.value === "preview"),
          );
        }}
      >
        <fieldset className="grid two">
          <legend>Run mode</legend>
          <label className="check-row">
            <input
              type="radio"
              name="runMode"
              value="new"
              checked={mode === "new"}
              onChange={() => updateMode("new")}
            />
            New run
          </label>
          <label className="check-row">
            <input
              type="radio"
              name="runMode"
              value="resume"
              checked={mode === "resume"}
              onChange={() => updateMode("resume")}
            />
            Resume
          </label>
        </fieldset>

        <fieldset className="grid">
          <legend>Manifest source</legend>
          {mode === "resume" ? (
            <label className="check-row">
              <input
                type="radio"
                name="manifestSource"
                value="none"
                checked={selectedSource === "none"}
                onChange={() => onManifestSourceChange("none")}
              />
              Use state file manifest
            </label>
          ) : null}
          <label className="check-row">
            <input
              type="radio"
              name="manifestSource"
              value="json"
              checked={selectedSource === "json"}
              onChange={() => onManifestSourceChange("json")}
            />
            Paste/import manifest JSON
          </label>
          {selectedSource === "json" ? (
            <div className="grid">
              <label>
                Manifest JSON
                <textarea
                  className="input"
                  rows={8}
                  required={mode === "new"}
                  value={manifestJson}
                  onChange={(event) => setManifestJson(event.currentTarget.value)}
                />
              </label>
              <label>
                Import manifest JSON
                <input
                  className="input"
                  type="file"
                  onChange={(event) =>
                    void importTextFile(
                      event.currentTarget.files?.[0],
                      setManifestJson,
                      setManifestFileName,
                      "Could not read manifest JSON file.",
                    )
                  }
                />
              </label>
              {manifestFileName ? (
                <p className="muted">Imported {manifestFileName}</p>
              ) : null}
            </div>
          ) : null}
          <label className="check-row">
            <input
              type="radio"
              name="manifestSource"
              value="workspacePath"
              checked={selectedSource === "workspacePath"}
              onChange={() => onManifestSourceChange("workspacePath")}
            />
            Workspace manifest path
          </label>
          {selectedSource === "workspacePath" ? (
            <label>
              Manifest path
              <input
                className="input"
                required={mode === "new"}
                value={manifestPath}
                onChange={(event) => onManifestPathChange(event.currentTarget.value)}
                placeholder="chains/manifests/my-chain.json"
              />
            </label>
          ) : null}
          <label className="check-row">
            <input
              type="radio"
              name="manifestSource"
              value="workspaceFile"
              checked={selectedSource === "workspaceFile"}
              onChange={() => onManifestSourceChange("workspaceFile")}
            />
            Workspace manifest file
          </label>
          {selectedSource === "workspaceFile" ? (
            <label>
              Manifest file
              <select
                className="input"
                required={mode === "new"}
                value={manifestFileId}
                onChange={(event) => setManifestFileId(event.currentTarget.value)}
              >
                <option value="">Select a workspace file</option>
                {files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.path}
                    {file.readableByCore ? "" : " (not readable by core)"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>

        {mode === "new" ? (
          <div className="grid">
            <label>
              Initial input
              <textarea
                className="input"
                required
                rows={5}
                value={initialInput}
                onChange={(event) =>
                  onInitialInputChange(event.currentTarget.value)
                }
              />
            </label>
            <label>
              Import initial input file
              <input
                className="input"
                type="file"
                onChange={(event) =>
                  void importTextFile(
                    event.currentTarget.files?.[0],
                    onInitialInputChange,
                    setInitialInputFileName,
                    "Could not read initial input file.",
                  )
                }
              />
            </label>
            {initialInputFileName ? (
              <p className="muted">Imported {initialInputFileName}</p>
            ) : null}
          </div>
        ) : (
          <label>
            State file path
            <input
              className="input"
              required
              value={resumeStatePath}
              onChange={(event) =>
                onResumeStatePathChange(event.currentTarget.value)
              }
              placeholder="chains/example/run/chain-state.json"
            />
          </label>
        )}

        <label>
          Model
          <input
            className="input"
            placeholder="openai/gpt-4.1-mini"
            value={model}
            onChange={(event) => setModel(event.currentTarget.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={allowScripts}
            onChange={(event) => onAllowScriptsChange(event.currentTarget.checked)}
          />
          Allow scripts
        </label>

        <div className="grid two">
          <button className="btn" type="submit" value="run" disabled={disabled}>
            {pendingAction === "run"
              ? "Running..."
              : pendingAction === "resume"
                ? "Resuming..."
                : mode === "resume"
                  ? "Resume chain"
                  : "Run chain"}
          </button>
          <button
            className="btn secondary"
            type="submit"
            value="preview"
            disabled={disabled}
          >
            {pendingAction === "preview"
              ? "Previewing..."
              : mode === "resume"
                ? "Preview resume"
                : "Preview chain run"}
          </button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
      <SkillChainResultPanel
        title="Skill chain result"
        workspaceId={workspaceId}
        result={result}
        canEdit={canEdit}
        onResumeChain={(statePath) => {
          onModeChange("resume");
          onResumeStatePathChange(statePath);
          onManifestSourceChange("none");
        }}
      />
    </section>
  );
}
