import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createWorkspaceFile, readWorkspaceTextFile, UnsupportedTextFileError, writeWorkspaceTextFile } from "./files";

const dbDescribe = process.env.DATABASE_URL ? describe : describe.skip;

dbDescribe("workspace file persistence invariants", () => {
  it("stores unsupported bytes but rejects core text reads", async () => {
    const { userId, workspaceId } = await createFixture("unsupported");
    const file = await createWorkspaceFile({
      userId,
      workspaceId,
      path: "evidence.pdf",
      bytes: Buffer.from("%PDF"),
      contentType: "application/pdf",
    });
    await expect(readWorkspaceTextFile(userId, workspaceId, file.id)).rejects.toBeInstanceOf(UnsupportedTextFileError);
  });

  it("creates monotonically increasing versions with previous version ids", async () => {
    const { userId, workspaceId } = await createFixture("versions");
    const file = await createWorkspaceFile({
      userId,
      workspaceId,
      path: "notes.md",
      bytes: Buffer.from("one"),
      contentType: "text/markdown",
    });
    const first = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    const second = await writeWorkspaceTextFile({ userId, workspaceId, fileId: file.id, text: "two" });
    const third = await writeWorkspaceTextFile({ userId, workspaceId, fileId: file.id, text: "three" });

    expect(second.versionNumber).toBe(2);
    expect(second.previousVersionId).toBe(first.currentVersionId);
    expect(third.versionNumber).toBe(3);
    expect(third.previousVersionId).toBe(second.id);
  });
});

async function createFixture(label: string): Promise<{ userId: string; workspaceId: string }> {
  const email = `${label}-${crypto.randomUUID()}@example.com`;
  const user = await prisma.user.create({ data: { email } });
  const workspace = await prisma.workspace.create({
    data: {
      ownerId: user.id,
      name: `Fixture ${label}`,
      members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
    },
  });
  return { userId: user.id, workspaceId: workspace.id };
}
