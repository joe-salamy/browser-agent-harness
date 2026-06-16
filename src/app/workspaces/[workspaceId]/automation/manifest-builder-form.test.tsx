// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManifestBuilderForm } from "./manifest-builder-form";
import type { BuildManifestResult } from "./types";

const fetchMock = vi.fn();

function Harness({
  onUseManifest = vi.fn(),
}: {
  onUseManifest?: (manifestPath: string, initialInput: string) => void;
}) {
  const [result, setResult] = useState<BuildManifestResult | null>(null);
  return (
    <ManifestBuilderForm
      workspaceId="workspace-1"
      canEdit={true}
      result={result}
      onResult={setResult}
      onUseManifest={onUseManifest}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});


describe("ManifestBuilderForm", () => {
  it("previews manifest creation without dispatching workspace updates", async () => {
    const user = userEvent.setup();
    const updateListener = vi.fn();
    window.addEventListener("workspace-updated", updateListener);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "DRY_RUN",
          workspaceId: "workspace-1",
          goalCharacters: 14,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<Harness />);
    await user.type(screen.getByLabelText("Goal"), " Build a chain. ");
    await user.type(screen.getByLabelText("Model"), " model-a ");
    await user.click(
      screen.getByRole("button", { name: "Preview manifest creation" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/workspace-1/skill-chain-manifests",
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      prompt: "Build a chain.",
      dryRun: true,
      model: "model-a",
    });
    expect(await screen.findByText(/Status:/)).toHaveTextContent("DRY_RUN");
    expect(screen.getByText("Goal characters: 14")).toBeInTheDocument();
    expect(updateListener).not.toHaveBeenCalled();
    window.removeEventListener("workspace-updated", updateListener);
  });

  it("imports a goal file before previewing manifest creation", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "DRY_RUN",
          workspaceId: "workspace-1",
          goalCharacters: 19,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<Harness />);
    await user.upload(
      screen.getByLabelText("Import goal file"),
      new File(["Imported goal text."], "goal.txt", { type: "text/plain" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview manifest creation" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      prompt: "Imported goal text.",
      dryRun: true,
    });
    expect(screen.getByText("Imported goal.txt")).toBeInTheDocument();
  });

  it("shows an actionable error when goal file import fails", async () => {
    const user = userEvent.setup();
    const file = new File(["unreadable"], "goal.txt", { type: "text/plain" });
    vi.spyOn(file, "text").mockRejectedValueOnce(new Error("read failed"));

    render(<Harness />);
    await user.upload(screen.getByLabelText("Import goal file"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read goal file.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a manifest, dispatches workspace updates, and hands it to the run form", async () => {
    const user = userEvent.setup();
    const updateListener = vi.fn();
    const onUseManifest = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runId: "run-1",
          status: "SUCCEEDED",
          outputFileId: "file-1",
          outputPath: "chains/manifests/demo.json",
          manifestPath: "chains/manifests/demo.json",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    window.addEventListener("workspace-updated", updateListener);
    render(<Harness onUseManifest={onUseManifest} />);
    await user.type(screen.getByLabelText("Goal"), "Summarize files.");
    await user.click(screen.getByRole("button", { name: "Create manifest" }));

    await screen.findByText("Manifest path: chains/manifests/demo.json");
    expect(updateListener).toHaveBeenCalledTimes(1);
    window.removeEventListener("workspace-updated", updateListener);

    await user.click(
      screen.getByRole("button", { name: "Use this manifest in run form" }),
    );
    expect(onUseManifest).toHaveBeenCalledWith(
      "chains/manifests/demo.json",
      "Summarize files.",
    );
  });
});
