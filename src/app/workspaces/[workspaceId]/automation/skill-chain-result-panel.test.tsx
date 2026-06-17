// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillChainResultPanel } from "./skill-chain-result-panel";
import type { SkillChainUiResult } from "./types";

describe("SkillChainResultPanel", () => {
  it("renders dry-run chain details", () => {
    const result: SkillChainUiResult = {
      status: "DRY_RUN",
      workspaceId: "workspace-1",
      mode: "new",
      manifestId: "demo-chain",
      scriptsEnabled: false,
    };

    render(
      <SkillChainResultPanel
        title="Skill chain result"
        workspaceId="workspace-1"
        result={result}
      />,
    );

    expect(screen.getByText(/Status:/)).toHaveTextContent("DRY_RUN");
    expect(screen.getByText("Mode: new")).toBeInTheDocument();
    expect(screen.getByText("Manifest: demo-chain")).toBeInTheDocument();
    expect(screen.getByText("Scripts enabled: no")).toBeInTheDocument();
  });

  it("renders real chain artifacts and resumes failed chains", async () => {
    const user = userEvent.setup();
    const onResumeChain = vi.fn();
    const result: SkillChainUiResult = {
      runId: "run-1",
      status: "FAILED",
      statePath: "chains/run/chain-state.json",
      manifestPath: "chains/manifests/demo.json",
      initialInputPath: "chains/run/input.txt",
      currentStepIndex: 0,
      errorMessage: "Needs a better input.",
      steps: [
        {
          id: "summarize",
          skillId: "server.research-synthesis",
          prompt: "Summarize.",
          outputPath: "chains/run/summary.md",
          status: "FAILED",
          outputFileId: "file-1",
          errorMessage: "Model call failed.",
        },
      ],
    };

    render(
      <SkillChainResultPanel
        title="Skill chain result"
        workspaceId="workspace-1"
        result={result}
        onResumeChain={onResumeChain}
      />,
    );

    expect(screen.getByText("run-1")).toBeInTheDocument();
    expect(screen.getByText("chains/run/chain-state.json")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "chains/run/summary.md" }),
    ).toHaveAttribute("href", "/workspaces/workspace-1?fileId=file-1");
    expect(screen.getByText("Needs a better input.")).toHaveClass("error-text");

    await user.click(screen.getByRole("button", { name: "Resume this chain" }));
    expect(onResumeChain).toHaveBeenCalledWith("chains/run/chain-state.json");
  });
});
