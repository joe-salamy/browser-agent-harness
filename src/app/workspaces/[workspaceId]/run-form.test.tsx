// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillSummary } from "@/server/skills/directory";
import { RunForm } from "./run-form";

const fetchMock = vi.fn();

const skills: SkillSummary[] = [
  {
    id: "server.research-synthesis",
    name: "research-synthesis",
    source: "server",
    description: "Synthesizes supported workspace text files.",
    hasEntrypoint: false,
    referenceCount: 0,
    scriptCount: 0,
    requiredPermissions: ["files:read", "files:write", "models:generate"],
  },
  {
    id: "workspace.my-skill",
    name: "my-skill",
    source: "workspace",
    description: "Runs workspace instructions.",
    hasEntrypoint: false,
    referenceCount: 0,
    scriptCount: 0,
    requiredPermissions: ["files:read", "files:write", "models:generate"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          runId: "run-1",
          status: "SUCCEEDED",
          outputFileId: "file-1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("RunForm", () => {
  it("posts no skillIds when none are checked and posts checked skills in order", async () => {
    const user = userEvent.setup();
    render(<RunForm workspaceId="workspace-1" skills={skills} />);

    await user.type(screen.getByLabelText("Prompt"), "Summarize the files.");
    await user.click(screen.getByRole("button", { name: /run agent/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/workspace-1/agent-runs",
    );
    expect(firstBody.getAll("skillIds")).toEqual([]);

    await user.click(
      screen.getByRole("checkbox", {
        name: /server\.research-synthesis — Synthesizes supported workspace text files\./,
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /workspace\.my-skill — Runs workspace instructions\./,
      }),
    );
    await user.click(screen.getByRole("button", { name: /run agent/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(secondBody.getAll("skillIds")).toEqual([
      "server.research-synthesis",
      "workspace.my-skill",
    ]);
  });
});
