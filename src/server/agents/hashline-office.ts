import ExcelJS from "exceljs";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import {
  applyHashlineOperations,
  HashlineEditConflictError,
  type HashlineEditOperation,
  UnsupportedHashlineFileError,
} from "./hashline-core";

const DOCX_DOCUMENT_PATH = "word/document.xml";
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isDocxHashlineFile(pathValue: string, contentType: string): boolean {
  return (
    pathValue.toLowerCase().endsWith(".docx") ||
    contentType.split(";", 1)[0].trim().toLowerCase() === DOCX_CONTENT_TYPE
  );
}

export function isXlsxHashlineFile(pathValue: string, contentType: string): boolean {
  return (
    pathValue.toLowerCase().endsWith(".xlsx") ||
    contentType.split(";", 1)[0].trim().toLowerCase() === XLSX_CONTENT_TYPE
  );
}

export async function readDocxParagraphLines(bytes: Buffer): Promise<string[]> {
  const documentXml = await readDocxDocumentXml(bytes);
  return extractDocxParagraphs(documentXml).map((paragraph) => paragraph.text);
}

export async function writeDocxParagraphLines(
  bytes: Buffer,
  editedLines: string[],
): Promise<Buffer> {
  if (editedLines.length === 0) {
    throw new HashlineEditConflictError("DOCX must keep at least one paragraph.");
  }
  const zip = await JSZip.loadAsync(bytes);
  const documentFile = zip.file(DOCX_DOCUMENT_PATH);
  if (!documentFile) throw new UnsupportedHashlineFileError();
  const documentXml = await documentFile.async("string");
  assertParseableXml(documentXml);
  const paragraphs = extractDocxParagraphs(documentXml);
  if (paragraphs.length === 0) {
    const paragraphXml = createDocxParagraphXml(editedLines[0] ?? "");
    const nextXml = documentXml.replace("</w:body>", `${paragraphXml}</w:body>`);
    zip.file(DOCX_DOCUMENT_PATH, nextXml);
    return zip.generateAsync({ type: "nodebuffer" });
  }

  const replacementXml = buildEditedDocxParagraphXml(paragraphs, editedLines);
  const first = paragraphs[0];
  const last = paragraphs[paragraphs.length - 1];
  const nextXml = `${documentXml.slice(0, first.start)}${replacementXml}${documentXml.slice(last.end)}`;
  zip.file(DOCX_DOCUMENT_PATH, nextXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function readXlsxCellLines(bytes: Buffer): Promise<string[]> {
  const workbook = await loadWorkbook(bytes);
  const lines: string[] = [];
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (isEmptyCell(cell)) return;
        lines.push(formatXlsxLine(worksheet.name, cell.address, cell));
      });
    });
  });
  return lines;
}

export async function applyXlsxCellLineOperations(
  bytes: Buffer,
  operations: HashlineEditOperation[],
): Promise<{ bytes: Buffer; lines: string[]; changedStartLine: number; changedEndLine: number }> {
  const workbook = await loadWorkbook(bytes);
  const entries = collectXlsxEntries(workbook);
  validateXlsxOperations(workbook, entries, operations);
  const originalLines = entries.map((entry) => entry.line);
  const result = applyHashlineOperations(originalLines, operations);
  const editedByAddress = new Map<string, ParsedXlsxLine>();
  for (const line of result.lines) {
    const parsed = parseXlsxLine(line);
    const key = xlsxAddressKey(parsed.sheetName, parsed.cellAddress);
    if (editedByAddress.has(key)) {
      throw new HashlineEditConflictError("XLSX inserts must target explicit empty cells.");
    }
    editedByAddress.set(key, parsed);
  }

  for (const entry of entries) {
    const edited = editedByAddress.get(entry.key);
    if (!edited) {
      if (entry.formula !== undefined) {
        throw new UnsupportedHashlineFileError(
          "Hashline edits cannot modify XLSX formula cells.",
        );
      }
      const worksheet = workbook.getWorksheet(entry.sheetName);
      if (worksheet) worksheet.getCell(entry.cellAddress).value = null;
      continue;
    }
    if (entry.formula !== undefined) {
      if (edited.value !== `=${entry.formula}`) {
        throw new UnsupportedHashlineFileError(
          "Hashline edits cannot modify XLSX formula cells.",
        );
      }
      continue;
    }
    const worksheet = workbook.getWorksheet(entry.sheetName);
    if (worksheet) worksheet.getCell(entry.cellAddress).value = edited.value;
  }

  for (const [key, edited] of editedByAddress) {
    if (entries.some((entry) => entry.key === key)) continue;
    const worksheet = workbook.getWorksheet(edited.sheetName);
    if (!worksheet || !isEmptyCell(worksheet.getCell(edited.cellAddress))) {
      throw new HashlineEditConflictError(
        "XLSX inserts must target explicit empty cells.",
      );
    }
    worksheet.getCell(edited.cellAddress).value = edited.value;
  }

  return {
    bytes: Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer,
    lines: result.lines,
    changedStartLine: result.changedStartLine,
    changedEndLine: result.changedEndLine,
  };
}

type DocxParagraph = {
  xml: string;
  text: string;
  start: number;
  end: number;
};

type XlsxEntry = {
  key: string;
  sheetName: string;
  cellAddress: string;
  line: string;
  formula?: string;
};

type ParsedXlsxLine = {
  sheetName: string;
  cellAddress: string;
  value: string;
};

async function readDocxDocumentXml(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const documentFile = zip.file(DOCX_DOCUMENT_PATH);
  if (!documentFile) throw new UnsupportedHashlineFileError();
  const documentXml = await documentFile.async("string");
  assertParseableXml(documentXml);
  return documentXml;
}

function assertParseableXml(xml: string): void {
  new XMLParser({ ignoreAttributes: false }).parse(xml);
}

function extractDocxParagraphs(documentXml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(documentXml))) {
    paragraphs.push({
      xml: match[0],
      text: extractDocxParagraphText(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return paragraphs;
}

function extractDocxParagraphText(paragraphXml: string): string {
  const textPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let text = "";
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(paragraphXml))) {
    text += unescapeXml(match[1]);
  }
  return text;
}

function buildEditedDocxParagraphXml(
  paragraphs: DocxParagraph[],
  editedLines: string[],
): string {
  const matches = longestCommonSubsequence(
    paragraphs.map((paragraph) => paragraph.text),
    editedLines,
  );
  const output: string[] = [];
  let originalIndex = 0;
  let editedIndex = 0;
  for (const match of matches) {
    appendChangedDocxRun(
      output,
      paragraphs,
      originalIndex,
      match.originalIndex,
      editedLines,
      editedIndex,
      match.editedIndex,
    );
    output.push(paragraphs[match.originalIndex].xml);
    originalIndex = match.originalIndex + 1;
    editedIndex = match.editedIndex + 1;
  }
  appendChangedDocxRun(
    output,
    paragraphs,
    originalIndex,
    paragraphs.length,
    editedLines,
    editedIndex,
    editedLines.length,
  );
  return output.join("");
}

function appendChangedDocxRun(
  output: string[],
  paragraphs: DocxParagraph[],
  originalStart: number,
  originalEnd: number,
  editedLines: string[],
  editedStart: number,
  editedEnd: number,
): void {
  let sourceIndex = originalStart;
  for (let index = editedStart; index < editedEnd; index += 1) {
    const sourceParagraph =
      sourceIndex < originalEnd
        ? paragraphs[sourceIndex]
        : nearestDocxParagraph(paragraphs, originalStart - 1, originalEnd);
    output.push(createDocxParagraphXml(editedLines[index], sourceParagraph?.xml));
    sourceIndex += 1;
  }
}

function nearestDocxParagraph(
  paragraphs: DocxParagraph[],
  previousIndex: number,
  nextIndex: number,
): DocxParagraph | undefined {
  if (previousIndex >= 0) return paragraphs[previousIndex];
  if (nextIndex < paragraphs.length) return paragraphs[nextIndex];
  return paragraphs[0];
}

function createDocxParagraphXml(text: string, sourceParagraphXml?: string): string {
  const paragraphProperties = sourceParagraphXml?.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  return `<w:p>${paragraphProperties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function longestCommonSubsequence(
  original: string[],
  edited: string[],
): Array<{ originalIndex: number; editedIndex: number }> {
  const lengths = Array.from({ length: original.length + 1 }, () =>
    Array<number>(edited.length + 1).fill(0),
  );
  for (let i = original.length - 1; i >= 0; i -= 1) {
    for (let j = edited.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        original[i] === edited[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const matches: Array<{ originalIndex: number; editedIndex: number }> = [];
  let i = 0;
  let j = 0;
  while (i < original.length && j < edited.length) {
    if (original[i] === edited[j]) {
      matches.push({ originalIndex: i, editedIndex: j });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

async function loadWorkbook(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return workbook;
}

function collectXlsxEntries(workbook: ExcelJS.Workbook): XlsxEntry[] {
  const entries: XlsxEntry[] = [];
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (isEmptyCell(cell)) return;
        const formula = getCellFormula(cell);
        entries.push({
          key: xlsxAddressKey(worksheet.name, cell.address),
          sheetName: worksheet.name,
          cellAddress: cell.address,
          line: formatXlsxLine(worksheet.name, cell.address, cell),
          formula,
        });
      });
    });
  });
  return entries;
}

function validateXlsxOperations(
  workbook: ExcelJS.Workbook,
  entries: XlsxEntry[],
  operations: HashlineEditOperation[],
): void {
  for (const operation of operations) {
    switch (operation.op) {
      case "replace": {
        const originalAddresses = entries
          .slice(operation.startLine - 1, operation.endLine)
          .map((entry) => entry.key);
        const replacementAddresses = operation.lines.map(
          (line) => xlsxAddressKeyFromLine(line),
        );
        if (
          originalAddresses.length !== replacementAddresses.length ||
          originalAddresses.some(
            (address, index) => address !== replacementAddresses[index],
          )
        ) {
          throw new HashlineEditConflictError(
            "XLSX replace operations must keep the same cell addresses.",
          );
        }
        break;
      }
      case "insert_before":
      case "insert_after":
        for (const line of operation.lines) {
          const parsed = parseXlsxLine(line);
          const worksheet = workbook.getWorksheet(parsed.sheetName);
          const existing = entries.find(
            (entry) => entry.key === xlsxAddressKey(parsed.sheetName, parsed.cellAddress),
          );
          if (existing || !worksheet || !isEmptyCell(worksheet.getCell(parsed.cellAddress))) {
            throw new HashlineEditConflictError(
              "XLSX inserts must target explicit empty cells.",
            );
          }
        }
        break;
      case "delete":
        break;
    }
  }
}

function formatXlsxLine(
  sheetName: string,
  cellAddress: string,
  cell: ExcelJS.Cell,
): string {
  const formula = getCellFormula(cell);
  const value = formula === undefined ? cell.text : `=${formula}`;
  return `${sheetName}!${cellAddress}\t${escapeXlsxValue(value)}`;
}

function getCellFormula(cell: ExcelJS.Cell): string | undefined {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    const formula = value.formula;
    if (typeof formula === "string") return formula;
  }
  return undefined;
}

function parseXlsxLine(line: string): ParsedXlsxLine {
  const separatorIndex = line.indexOf("\t");
  if (separatorIndex <= 0) {
    throw new HashlineEditConflictError(
      "XLSX inserts must target explicit empty cells.",
    );
  }
  const address = line.slice(0, separatorIndex);
  const bangIndex = address.lastIndexOf("!");
  if (bangIndex <= 0 || bangIndex === address.length - 1) {
    throw new HashlineEditConflictError(
      "XLSX inserts must target explicit empty cells.",
    );
  }
  return {
    sheetName: address.slice(0, bangIndex),
    cellAddress: address.slice(bangIndex + 1),
    value: unescapeXlsxValue(line.slice(separatorIndex + 1)),
  };
}

function xlsxAddressKeyFromLine(line: string): string {
  const parsed = parseXlsxLine(line);
  return xlsxAddressKey(parsed.sheetName, parsed.cellAddress);
}

function xlsxAddressKey(sheetName: string, cellAddress: string): string {
  return `${sheetName}!${cellAddress.toUpperCase()}`;
}

function isEmptyCell(cell: ExcelJS.Cell): boolean {
  return cell.value === null || cell.value === undefined || cell.text === "";
}

function escapeXlsxValue(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll(/\r\n|\r|\n/g, "\\n");
}

function unescapeXlsxValue(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\" || index === value.length - 1) {
      output += character;
      continue;
    }
    const next = value[index + 1];
    if (next === "t") output += "\t";
    else if (next === "n") output += "\n";
    else output += next;
    index += 1;
  }
  return output;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
