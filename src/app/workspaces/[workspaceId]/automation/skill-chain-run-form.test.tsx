// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillChainRunForm } from "./skill-chain-run-form";
import type {
  AutomationFileOption,
  ManifestSource,
  RunMode,
  SkillChainUiResult,
} from "./types";

const fetchMock = vi.fn();
const manifestJson = JSON.stringify({
  version: 1,
  id: "demo-chain",
  name: "Demo chain",
  steps: [
    {
      id: "summarize",
      skillId: "server.research-synthesis",
      prompt: "Summarize the input.",
      outputPath: "chains/{{runId}}/summary.md",
    },
  ],
});

const files: AutomationFileOption[] = [
  {
    id: "file-1",
    path: "chains/manifests/demo.json",
    contentType: "application/json",
    sizeBytes: 123,
    readableByCore: true,
  },
];

function Harness() {
  const [result, setResult] = useState<SkillChainUiResult | null>(null);
  const [mode, setMode] = useState<RunMode>("new");
  const [manifestSource, setManifestSource] = useState<ManifestSource>("json");
  const [manifestPath, setManifestPath] = useState("");
  const [initialInput, setInitialInput] = useState("");
  const [resumeStatePath, setResumeStatePath] = useState("");
  const [allowScripts, setAllowScripts] = useState(false);
  return (
    <SkillChainRunForm
      workspaceId="workspace-1"
      files={files}
      canEdit={true}
      result={result}
      mode={mode}
      onModeChange={setMode}
      manifestSource={manifestSource}
      onManifestSourceChange={setManifestSource}
      manifestPath={manifestPath}
      onManifestPathChange={setManifestPath}
      initialInput={initialInput}
      onInitialInputChange={setInitialInput}
      resumeStatePath={resumeStatePath}
      onResumeStatePathChange={setResumeStatePath}
      allowScripts={allowScripts}
      onAllowScriptsChange={setAllowScripts}
      onResult={setResult}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "DRY_RUN",
        workspaceId: "workspace-1",
        mode: "new",
        manifestId: "demo-chain",
        scriptsEnabled: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("SkillChainRunForm", () => {
  it("previews a new run from pasted manifest JSON and initial input", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Manifest JSON"));
    await user.paste(manifestJson);
    await user.type(screen.getByLabelText("Initial input"), " Analyze this. ");
    await user.click(screen.getByRole("button", { name: "Preview chain run" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/workspace-1/skill-chains",
    );
    expect(body).toMatchObject({
      dryRun: true,
      initialInput: "Analyze this.",
    });
    expect(body.manifest.id).toBe("demo-chain");
    expect(await screen.findByText("Mode: new")).toBeInTheDocument();
    expect(screen.getByText("Manifest: demo-chain")).toBeInTheDocument();
  });

  it("imports manifest JSON and initial input files before previewing", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(
      screen.getByLabelText("Import manifest JSON"),
      new File([manifestJson], "manifest.json", { type: "application/json" }),
    );
    await user.upload(
      screen.getByLabelText("Import initial input file"),
      new File(["Imported input."], "input.txt", { type: "text/plain" }),
    );
    await user.click(screen.getByRole("button", { name: "Preview chain run" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.manifest.id).toBe("demo-chain");
    expect(body.initialInput).toBe("Imported input.");
    expect(body.dryRun).toBe(true);
    expect(screen.getByText("Imported manifest.json")).toBeInTheDocument();
    expect(screen.getByText("Imported input.txt")).toBeInTheDocument();
  });

  it("previews a new run from a workspace manifest file", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Workspace manifest file"));
    await user.selectOptions(screen.getByLabelText("Manifest file"), "file-1");
    await user.type(screen.getByLabelText("Initial input"), "Use this file.");
    await user.click(screen.getByRole("button", { name: "Preview chain run" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      manifestFileId: "file-1",
      initialInput: "Use this file.",
      dryRun: true,
    });
  });

  it("keeps values and does not submit invalid manifest JSON", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByLabelText("Manifest JSON"));
    await user.paste("{");
    await user.type(screen.getByLabelText("Initial input"), "Analyze this.");
    await user.click(screen.getByRole("button", { name: "Preview chain run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Manifest JSON is invalid.",
    );
    expect(screen.getByLabelText("Manifest JSON")).toHaveValue("{");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews resume with a state path and no initial input", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "DRY_RUN",
          workspaceId: "workspace-1",
          mode: "resume",
          scriptsEnabled: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<Harness />);

    await user.click(screen.getByLabelText("Resume"));
    await user.type(
      screen.getByLabelText("State file path"),
      "chains/run/chain-state.json",
    );
    await user.click(screen.getByLabelText("Allow scripts"));
    await user.click(screen.getByRole("button", { name: "Preview resume" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      resumeStatePath: "chains/run/chain-state.json",
      allowScripts: true,
      dryRun: true,
    });
    expect(await screen.findByText("Mode: resume")).toBeInTheDocument();
    expect(screen.getByText("Scripts enabled: yes")).toBeInTheDocument();
  });

  it("runs from a workspace manifest path and dispatches workspace updates", async () => {
    const user = userEvent.setup();
    const updateListener = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runId: "run-1",
          status: "SUCCEEDED",
          statePath: "chains/run/chain-state.json",
          manifestPath: "chains/manifests/demo.json",
          initialInputPath: "chains/run/input.txt",
          currentStepIndex: 1,
          steps: [
            {
              id: "summarize",
              skillId: "server.research-synthesis",
              prompt: "Summarize.",
              outputPath: "chains/run/summary.md",
              status: "SUCCEEDED",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    window.addEventListener("workspace-updated", updateListener);
    render(<Harness />);

    await user.click(screen.getByLabelText("Workspace manifest path"));
    await user.type(
      screen.getByLabelText("Manifest path"),
      "chains/manifests/demo.json",
    );
    await user.type(screen.getByLabelText("Initial input"), "Run this chain.");
    await user.click(screen.getByRole("button", { name: "Run chain" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      manifestPath: "chains/manifests/demo.json",
      initialInput: "Run this chain.",
    });
    expect(updateListener).toHaveBeenCalledTimes(1);
    window.removeEventListener("workspace-updated", updateListener);
    expect(await screen.findByText("run-1")).toBeInTheDocument();
  });
});
