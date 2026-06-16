import { describe, expect, it } from "vitest";
import { WorkspaceAccessError } from "@/server/workspaces/access";
import { workspaceRouteErrorResponse } from "./route-errors";

async function errorBody(response: Response): Promise<{ error: string }> {
  return (await response.json()) as { error: string };
}

describe("workspaceRouteErrorResponse", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const response = workspaceRouteErrorResponse(
      new Error("Authentication required."),
      "Fallback.",
      400,
    );

    expect(response.status).toBe(401);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("returns 403 without leaking authorization internals", async () => {
    const response = workspaceRouteErrorResponse(
      new WorkspaceAccessError("private details"),
      "Fallback.",
      400,
    );

    expect(response.status).toBe(403);
    await expect(errorBody(response)).resolves.toEqual({ error: "Forbidden." });
  });

  it("uses the route fallback for unexpected errors", async () => {
    const response = workspaceRouteErrorResponse(
      new Error("database host:5432"),
      "Upload failed.",
      400,
    );

    expect(response.status).toBe(400);
    await expect(errorBody(response)).resolves.toEqual({
      error: "Upload failed.",
    });
  });
});
