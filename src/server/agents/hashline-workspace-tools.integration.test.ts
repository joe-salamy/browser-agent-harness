import crypto from "crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createHashlineTag, UnsupportedHashlineFileError } from "@/server/agents/hashline-core";
import {
  applyWorkspaceHashlineEdits,
  readWorkspaceHashlines,
} from "@/server/agents/hashline-workspace-tools";
import { getObjectStore } from "@/server/storage";
import { createWorkspaceFile, writeWorkspaceTextFile } from "@/server/workspaces/files";

const dbDescribe = process.env.DATABASE_URL ? describe : describe.skip;

dbDescribe("workspace hashline tools", () => {
  it("rejects stale baseVersionId and baseVersionSha256 without writing", async () => {
    const { userId, workspaceId } = await createFixture("hashline-stale");
    const file = await createWorkspaceFile({
      userId,
      workspaceId,
      path: "notes.md",
      bytes: Buffer.from("one\ntwo", "utf8"),
      contentType: "text/markdown",
    });
    const snapshot = await readWorkspaceHashlines({ userId, workspaceId, fileId: file.id });
    await writeWorkspaceTextFile({ userId, workspaceId, fileId: file.id, text: "changed" });

    await expect(
      applyWorkspaceHashlineEdits({
        userId,
        workspaceId,
        fileId: file.id,
        tag: snapshot.tag,
        baseVersionId: snapshot.baseVersionId,
        baseVersionSha256: snapshot.baseVersionSha256,
        operations: [{ op: "replace", startLine: 1, endLine: 1, lines: ["new"] }],
      }),
    ).rejects.toThrow("File changed since hashline snapshot was read.");

    const versions = await prisma.workspaceFileVersion.findMany({
      where: { fileId: file.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions).toHaveLength(2);
  });

  it("rejects unsupported file types", async () => {
    const { userId, workspaceId } = await createFixture("hashline-unsupported");
    const file = await createWorkspaceFile({
      userId,
      workspaceId,
      path: "evidence.pdf",
      bytes: Buffer.from("%PDF"),
      contentType: "application/pdf",
    });

    await expect(readWorkspaceHashlines({ userId, workspaceId, fileId: file.id })).rejects.toBeInstanceOf(
      UnsupportedHashlineFileError,
    );
  });

  it("creates DOCX version two with previousVersionId chaining", async () => {
    const { userId, workspaceId } = await createFixture("hashline-docx");
    const file = await createWorkspaceFile({
      userId,
      workspaceId,
      path: "brief.docx",
      bytes: await createDocxBuffer(["<w:p><w:r><w:t>Old</w:t></w:r></w:p>"]),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const first = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    const snapshot = await readWorkspaceHashlines({ userId, workspaceId, fileId: file.id });

    const result = await applyWorkspaceHashlineEdits({
      userId,
      workspaceId,
      fileId: file.id,
      tag: snapshot.tag,
      baseVersionId: snapshot.baseVersionId,
      baseVersionSha256: snapshot.baseVersionSha256,
      operations: [{ op: "replace", startLine: 1, endLine: 1, lines: ["New"] }],
    });

    const version = await prisma.workspaceFileVersion.findUniqueOrThrow({ where: { id: result.versionId } });
    expect(version.versionNumber).toBe(2);
    expect(version.previousVersionId).toBe(first.currentVersionId);
    expect(result.tag).toBe(createHashlineTag(version.id, version.sha256));
  });

  it("creates XLSX version two and stores edited bytes", async () => {
    const { userId, workspaceId } = await createFixture("hashline-xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.getCell("A1").value = "Old";
    const file = await createWorkspaceFile({
      userId,
      workspaceId,
      path: "data.xlsx",
      bytes: Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const first = await prisma.workspaceFile.findUniqueOrThrow({ where: { id: file.id } });
    const snapshot = await readWorkspaceHashlines({ userId, workspaceId, fileId: file.id });

    const result = await applyWorkspaceHashlineEdits({
      userId,
      workspaceId,
      fileId: file.id,
      tag: snapshot.tag,
      baseVersionId: snapshot.baseVersionId,
      baseVersionSha256: snapshot.baseVersionSha256,
      operations: [{ op: "replace", startLine: 1, endLine: 1, lines: ["Data!A1\tNew"] }],
    });

    const version = await prisma.workspaceFileVersion.findUniqueOrThrow({ where: { id: result.versionId } });
    expect(version.versionNumber).toBe(2);
    expect(version.previousVersionId).toBe(first.currentVersionId);
    const bytes = await getObjectStore().getObject({ key: version.objectKey });
    const edited = new ExcelJS.Workbook();
    await edited.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(edited.getWorksheet("Data")?.getCell("A1").value).toBe("New");
  });
});

async function createFixture(
  label: string,
): Promise<{ userId: string; workspaceId: string }> {
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

async function createDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
