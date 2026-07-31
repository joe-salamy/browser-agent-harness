// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadForm } from "./upload-form";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

function submitUploadForm() {
  const form = screen
    .getByRole("button", { name: /upload file/i })
    .closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form as HTMLFormElement);
}

describe("UploadForm", () => {
  it("uploads a file, resets the form, shows success, and dispatches workspace-updated", async () => {
    const user = userEvent.setup();
    const workspaceUpdated = vi.fn();
    window.addEventListener("workspace-updated", workspaceUpdated);
    render(<UploadForm workspaceId="workspace-1" />);

    const fileInput = screen.getByLabelText("File") as HTMLInputElement;
    const pathInput = screen.getByLabelText("Workspace path") as HTMLInputElement;
    const file = new File(["hello"], "notes.md", { type: "text/markdown" });

    await user.upload(fileInput, file);
    await user.type(pathInput, "notes.md");
    submitUploadForm();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/workspace-1/files",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(body.get("path")).toBe("notes.md");

    expect(await screen.findByText("Uploaded.")).toBeTruthy();
    expect(pathInput.value).toBe("");
    expect(workspaceUpdated).toHaveBeenCalledTimes(1);

    window.removeEventListener("workspace-updated", workspaceUpdated);
  });

  it("shows the response error without dispatching workspace-updated when upload fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload rejected." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    const workspaceUpdated = vi.fn();
    window.addEventListener("workspace-updated", workspaceUpdated);
    render(<UploadForm workspaceId="workspace-1" />);

    const file = new File(["hello"], "notes.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText("File"), file);
    submitUploadForm();

    expect(await screen.findByText("Upload rejected.")).toBeTruthy();
    expect(workspaceUpdated).not.toHaveBeenCalled();

    window.removeEventListener("workspace-updated", workspaceUpdated);
  });
});
