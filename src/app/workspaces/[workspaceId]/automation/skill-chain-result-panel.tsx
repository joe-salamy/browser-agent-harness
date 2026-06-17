"use client";

import type { BuildManifestResult, SkillChainUiResult } from "./types";

type ResultPanelProps = {
  title: string;
  workspaceId: string;
  result: BuildManifestResult | SkillChainUiResult | null;
  canEdit?: boolean;
  onUseManifest?: (manifestPath: string) => void;
  onResumeChain?: (statePath: string) => void;
};

type StepWithMessage = Extract<
  SkillChainUiResult,
  { statePath: string }
>["steps"][number] & { message?: string };

function isBuilderDryRun(
  result: BuildManifestResult | SkillChainUiResult,
): result is Extract<BuildManifestResult, { goalCharacters: number }> {
  return result.status === "DRY_RUN" && "goalCharacters" in result;
}

function isChainDryRun(
  result: BuildManifestResult | SkillChainUiResult,
): result is Extract<SkillChainUiResult, { mode: "new" | "resume" }> {
  return result.status === "DRY_RUN" && "mode" in result;
}

function isRealChainResult(
  result: BuildManifestResult | SkillChainUiResult,
): result is Extract<SkillChainUiResult, { statePath: string }> {
  return "statePath" in result && "steps" in result;
}

function outputLink(
  workspaceId: string,
  outputFileId: string | undefined,
  label: string | undefined,
) {
  if (!outputFileId) return null;
  return (
    <a
      className="badge"
      href={`/workspaces/${workspaceId}?fileId=${outputFileId}`}
    >
      {label || "Open output file"}
    </a>
  );
}

export function SkillChainResultPanel({
  title,
  workspaceId,
  result,
  canEdit = true,
  onUseManifest,
  onResumeChain,
}: ResultPanelProps) {
  if (!result) return null;

  if (isBuilderDryRun(result)) {
    return (
      <section className="card" aria-live="polite">
        <h3>{title}</h3>
        <p>
          Status: <strong>{result.status}</strong>
        </p>
        <p>Goal characters: {result.goalCharacters}</p>
      </section>
    );
  }

  if (isChainDryRun(result)) {
    return (
      <section className="card" aria-live="polite">
        <h3>{title}</h3>
        <p>
          Status: <strong>{result.status}</strong>
        </p>
        <p>Mode: {result.mode}</p>
        {result.manifestId ? <p>Manifest: {result.manifestId}</p> : null}
        <p>Scripts enabled: {result.scriptsEnabled ? "yes" : "no"}</p>
      </section>
    );
  }

  if (isRealChainResult(result)) {
    const canResume =
      result.status === "FAILED" || result.status === "WAITING_FOR_INPUT";
    return (
      <section className="card" aria-live="polite">
        <h3>{title}</h3>
        <dl className="grid">
          <div>
            <dt>Run</dt>
            <dd>{result.runId}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{result.status}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{result.statePath}</dd>
          </div>
          <div>
            <dt>Manifest</dt>
            <dd>{result.manifestPath}</dd>
          </div>
          <div>
            <dt>Initial input</dt>
            <dd>{result.initialInputPath}</dd>
          </div>
          <div>
            <dt>Current step</dt>
            <dd>
              {Math.min(result.currentStepIndex + 1, result.steps.length)} of{" "}
              {result.steps.length}
            </dd>
          </div>
        </dl>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Skill</th>
              <th scope="col">Status</th>
              <th scope="col">Output</th>
              <th scope="col">Message</th>
            </tr>
          </thead>
          <tbody>
            {result.steps.map((step, index) => {
              const stepWithMessage = step as StepWithMessage;
              return (
                <tr key={step.id}>
                  <td>
                    {index + 1}. {step.id}
                  </td>
                  <td>{step.skillId}</td>
                  <td>{step.status}</td>
                  <td>
                    {outputLink(
                      workspaceId,
                      step.outputFileId,
                      step.outputPath,
                    )}
                  </td>
                  <td>{stepWithMessage.message ?? step.errorMessage ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result.errorMessage ? (
          <p className="error-text">{result.errorMessage}</p>
        ) : null}
        {canResume && onResumeChain ? (
          <button
            className="btn secondary"
            type="button"
            disabled={!canEdit}
            onClick={() => onResumeChain(result.statePath)}
          >
            Resume this chain
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="card" aria-live="polite">
      <h3>{title}</h3>
      <p>
        Status: <strong>{result.status}</strong>
      </p>
      {"manifestPath" in result && result.manifestPath ? (
        <p>Manifest path: {result.manifestPath}</p>
      ) : null}
      {"outputFileId" in result && result.outputFileId ? (
        <p>
          Output file:{" "}
          {outputLink(workspaceId, result.outputFileId, result.outputPath)}
        </p>
      ) : null}
      {"errorMessage" in result && result.errorMessage ? (
        <p className="error-text">{result.errorMessage}</p>
      ) : null}
      {"manifestPath" in result && result.manifestPath && onUseManifest ? (
        <button
          className="btn secondary"
          type="button"
          disabled={!canEdit}
          onClick={() => onUseManifest(result.manifestPath as string)}
        >
          Use this manifest in run form
        </button>
      ) : null}
    </section>
  );
}
