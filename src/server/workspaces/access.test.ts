import { describe, expect, it } from "vitest";
import { WorkspaceRole } from "@prisma/client";
import { hasRoleAtLeast } from "./access";

describe("workspace role order", () => {
  it("enforces VIEWER < EDITOR < OWNER", () => {
    expect(hasRoleAtLeast(WorkspaceRole.VIEWER, WorkspaceRole.VIEWER)).toBe(true);
    expect(hasRoleAtLeast(WorkspaceRole.VIEWER, WorkspaceRole.EDITOR)).toBe(false);
    expect(hasRoleAtLeast(WorkspaceRole.EDITOR, WorkspaceRole.VIEWER)).toBe(true);
    expect(hasRoleAtLeast(WorkspaceRole.EDITOR, WorkspaceRole.OWNER)).toBe(false);
    expect(hasRoleAtLeast(WorkspaceRole.OWNER, WorkspaceRole.EDITOR)).toBe(true);
  });
});
