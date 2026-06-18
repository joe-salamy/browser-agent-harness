import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { HashlineEditConflictError, UnsupportedHashlineFileError } from "./hashline-core";
import {
  applyXlsxCellLineOperations,
  readDocxParagraphLines,
  readXlsxCellLines,
  writeDocxParagraphLines,
} from "./hashline-office";

describe("hashline Office adapters", () => {
  it("reads and rewrites DOCX paragraph lines", async () => {
    const docx = await createDocxBuffer([
      "<w:p><w:pPr><w:jc w:val=\"left\"/></w:pPr><w:r><w:t>First</w:t></w:r></w:p>",
      "<w:p><w:r><w:t>Second</w:t></w:r></w:p>",
    ]);

    expect(await readDocxParagraphLines(docx)).toEqual(["First", "Second"]);

    const replaced = await writeDocxParagraphLines(docx, [
      "First",
      "Inserted",
      "Changed & escaped",
    ]);
    const replacedXml = await readDocumentXml(replaced);
    expect(await readDocxParagraphLines(replaced)).toEqual([
      "First",
      "Inserted",
      "Changed & escaped",
    ]);
    expect(replacedXml).toContain("<w:jc w:val=\"left\"/>");
    expect(replacedXml).toContain("Changed &amp; escaped");
  });

  it("rejects DOCX edits that remove every paragraph", async () => {
    await expect(writeDocxParagraphLines(await createDocxBuffer(["<w:p/>"]), [])).rejects.toThrow(
      "DOCX must keep at least one paragraph.",
    );
    await expect(writeDocxParagraphLines(await createDocxBuffer(["<w:p/>"]), [])).rejects.toBeInstanceOf(
      HashlineEditConflictError,
    );
  });

  it("reads XLSX non-empty cells in deterministic worksheet row column order", async () => {
    const workbook = new ExcelJS.Workbook();
    const alpha = workbook.addWorksheet("Alpha");
    alpha.getCell("B2").value = "later";
    alpha.getCell("A1").value = "first";
    const beta = workbook.addWorksheet("Beta");
    beta.getCell("A1").value = { formula: "SUM(1,2)", result: 3 };

    expect(await readXlsxCellLines(Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer)).toEqual([
      "Alpha!A1\tfirst",
      "Alpha!B2\tlater",
      "Beta!A1\t=SUM(1,2)",
    ]);
  });

  it("replaces deletes and inserts XLSX cell values without shifting rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet One");
    sheet.getCell("A1").value = "old";
    sheet.getCell("B2").value = "delete me";
    const result = await applyXlsxCellLineOperations(
      Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer,
      [
        {
          op: "replace",
          startLine: 1,
          endLine: 1,
          lines: ["Sheet One!A1\tnew\\tvalue"],
        },
        { op: "delete", startLine: 2, endLine: 2 },
        { op: "insert_after", line: 2, lines: ["Sheet One!C3\tinserted"] },
      ],
    );
    const edited = new ExcelJS.Workbook();
    await edited.xlsx.load(result.bytes as unknown as ExcelJS.Buffer);
    const editedSheet = edited.getWorksheet("Sheet One");

    expect(result.lines).toEqual([
      "Sheet One!A1\tnew\\tvalue",
      "Sheet One!C3\tinserted",
    ]);
    expect(editedSheet?.getCell("A1").value).toBe("new\tvalue");
    expect(editedSheet?.getCell("B2").value).toBeNull();
    expect(editedSheet?.getCell("C3").value).toBe("inserted");
  });

  it("rejects XLSX formula edits and non-empty insert targets", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.getCell("A1").value = { formula: "SUM(1,2)", result: 3 };
    sheet.getCell("B1").value = "occupied";
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer;

    await expect(
      applyXlsxCellLineOperations(bytes, [
        { op: "replace", startLine: 1, endLine: 1, lines: ["Sheet1!A1\t=SUM(2,3)"] },
      ]),
    ).rejects.toThrow(UnsupportedHashlineFileError);

    await expect(
      applyXlsxCellLineOperations(bytes, [
        { op: "insert_after", line: 1, lines: ["Sheet1!B1\tbad"] },
      ]),
    ).rejects.toThrow("XLSX inserts must target explicit empty cells.");
  });
});

async function createDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function readDocumentXml(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Missing document.xml.");
  return documentFile.async("string");
}
