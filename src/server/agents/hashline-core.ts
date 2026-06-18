import crypto from "crypto";

export type HashlineEditOperation =
  | { op: "replace"; startLine: number; endLine: number; lines: string[] }
  | { op: "delete"; startLine: number; endLine: number }
  | { op: "insert_before"; line: number; lines: string[] }
  | { op: "insert_after"; line: number; lines: string[] };

export type HashlineSnapshot = {
  fileId: string;
  path: string;
  contentType: string;
  adapter: "text" | "docx" | "xlsx";
  tag: string;
  baseVersionId: string;
  baseVersionSha256: string;
  lineCount: number;
  contentStartLine: number;
  contentEndLine: number;
  truncated: boolean;
  content: string;
};

export type HashlineApplyResult = {
  versionId: string;
  versionNumber: number;
  tag: string;
  preview: string;
  unchanged?: true;
};

export class HashlineEditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HashlineEditConflictError";
  }
}

export class HashlineStaleSnapshotError extends Error {
  constructor() {
    super("File changed since hashline snapshot was read.");
    this.name = "HashlineStaleSnapshotError";
  }
}

export class UnsupportedHashlineFileError extends Error {
  constructor(message = "Hashline edits are not supported for this file type.") {
    super(message);
    this.name = "UnsupportedHashlineFileError";
  }
}

export function createHashlineTag(versionId: string, sha256: string): string {
  return crypto
    .createHash("sha256")
    .update(`${versionId}:${sha256}`)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();
}

export function splitHashlineText(text: string): {
  lines: string[];
  newline: "\n" | "\r\n";
  trailingNewline: boolean;
} {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  if (text.length === 0) return { lines: [], newline, trailingNewline: false };
  const trailingNewline = text.endsWith("\n");
  const lines = text.split(/\r\n|\n/);
  if (trailingNewline) lines.pop();
  return { lines, newline, trailingNewline };
}

export function joinHashlineText(
  lines: string[],
  newline: "\n" | "\r\n",
  originalTrailingNewline: boolean,
): string {
  if (lines.length === 0) return "";
  const text = lines.join(newline);
  return originalTrailingNewline || lines[lines.length - 1] === ""
    ? `${text}${newline}`
    : text;
}

export function formatHashlineContent(input: {
  path: string;
  tag: string;
  lines: string[];
  startLine?: number;
  endLine?: number;
  footer?: string;
}): string {
  const startLine = input.startLine ?? (input.lines.length === 0 ? 0 : 1);
  const rows = [`[${input.path}#${input.tag}]`];
  for (let index = 0; index < input.lines.length; index += 1) {
    rows.push(`${startLine + index}:${input.lines[index]}`);
  }
  if (input.footer) rows.push(input.footer);
  return rows.join("\n");
}

export function buildHashlineSnapshot(input: {
  fileId: string;
  path: string;
  contentType: string;
  adapter: "text" | "docx" | "xlsx";
  versionId: string;
  sha256: string;
  lines: string[];
  startLine?: number;
  endLine?: number;
  maxLines?: number;
}): HashlineSnapshot {
  const tag = createHashlineTag(input.versionId, input.sha256);
  const lineCount = input.lines.length;
  const requestedStart = input.startLine ?? (lineCount === 0 ? 0 : 1);
  const requestedEnd = input.endLine ?? lineCount;
  if (lineCount === 0) {
    if (
      (input.startLine !== undefined && input.startLine !== 0) ||
      (input.endLine !== undefined && input.endLine !== 0)
    ) {
      throw new HashlineEditConflictError("Hashline line range is invalid.");
    }
    return {
      fileId: input.fileId,
      path: input.path,
      contentType: input.contentType,
      adapter: input.adapter,
      tag,
      baseVersionId: input.versionId,
      baseVersionSha256: input.sha256,
      lineCount,
      contentStartLine: 0,
      contentEndLine: 0,
      truncated: false,
      content: formatHashlineContent({ path: input.path, tag, lines: [] }),
    };
  }
  if (
    !Number.isInteger(requestedStart) ||
    !Number.isInteger(requestedEnd) ||
    requestedStart < 1 ||
    requestedEnd < requestedStart ||
    requestedEnd > lineCount
  ) {
    throw new HashlineEditConflictError("Hashline line range is invalid.");
  }
  const maxLines = input.maxLines ?? lineCount;
  if (!Number.isInteger(maxLines) || maxLines < 1) {
    throw new HashlineEditConflictError("Hashline maxLines is invalid.");
  }
  const uncappedCount = requestedEnd - requestedStart + 1;
  const returnedCount = Math.min(uncappedCount, maxLines);
  const contentEndLine = requestedStart + returnedCount - 1;
  const truncated = returnedCount < uncappedCount;
  const footer = truncated
    ? `[${uncappedCount - returnedCount} lines elided; call read_hashlines with startLine/endLine to inspect a smaller range]`
    : undefined;
  const contentLines = input.lines.slice(requestedStart - 1, contentEndLine);
  return {
    fileId: input.fileId,
    path: input.path,
    contentType: input.contentType,
    adapter: input.adapter,
    tag,
    baseVersionId: input.versionId,
    baseVersionSha256: input.sha256,
    lineCount,
    contentStartLine: requestedStart,
    contentEndLine,
    truncated,
    content: formatHashlineContent({
      path: input.path,
      tag,
      lines: contentLines,
      startLine: requestedStart,
      footer,
    }),
  };
}

export function applyHashlineOperations(
  originalLines: string[],
  operations: HashlineEditOperation[],
): { lines: string[]; changedStartLine: number; changedEndLine: number } {
  validateHashlineOperations(originalLines.length, operations);
  const lines = originalLines.slice();
  const normalizedOperations = mergeSameAnchorInserts(operations);
  const indexed = normalizedOperations.map((operation, index) => ({
    operation,
    index,
  }));
  indexed.sort((left, right) => {
    const lineDiff = anchorLine(right.operation) - anchorLine(left.operation);
    return lineDiff === 0 ? left.index - right.index : lineDiff;
  });

  let changedStartLine = Number.POSITIVE_INFINITY;
  let changedEndLine = 0;
  for (const { operation } of indexed) {
    switch (operation.op) {
      case "replace":
        lines.splice(
          operation.startLine - 1,
          operation.endLine - operation.startLine + 1,
          ...operation.lines,
        );
        changedStartLine = Math.min(changedStartLine, operation.startLine);
        changedEndLine = Math.max(
          changedEndLine,
          operation.startLine + Math.max(operation.lines.length, 1) - 1,
        );
        break;
      case "delete":
        lines.splice(
          operation.startLine - 1,
          operation.endLine - operation.startLine + 1,
        );
        changedStartLine = Math.min(changedStartLine, operation.startLine);
        changedEndLine = Math.max(changedEndLine, operation.startLine);
        break;
      case "insert_before":
        lines.splice(operation.line - 1, 0, ...operation.lines);
        changedStartLine = Math.min(changedStartLine, operation.line);
        changedEndLine = Math.max(
          changedEndLine,
          operation.line + Math.max(operation.lines.length, 1) - 1,
        );
        break;
      case "insert_after": {
        const insertionIndex = operation.line === 0 ? 0 : operation.line;
        lines.splice(insertionIndex, 0, ...operation.lines);
        const firstInsertedLine = operation.line + 1;
        changedStartLine = Math.min(changedStartLine, firstInsertedLine);
        changedEndLine = Math.max(
          changedEndLine,
          firstInsertedLine + Math.max(operation.lines.length, 1) - 1,
        );
        break;
      }
    }
  }
  return {
    lines,
    changedStartLine: Number.isFinite(changedStartLine) ? changedStartLine : 1,
    changedEndLine: Math.max(changedEndLine, 1),
  };
}

export function createHashlinePreview(input: {
  path: string;
  tag: string;
  lines: string[];
  changedStartLine: number;
  changedEndLine: number;
  maxLines?: number;
}): string {
  if (input.lines.length === 0) {
    return formatHashlineContent({ path: input.path, tag: input.tag, lines: [] });
  }
  const maxLines = input.maxLines ?? 20;
  const contextStart = Math.max(1, input.changedStartLine - 1);
  const contextEnd = Math.min(input.lines.length, input.changedEndLine + 1);
  const startLine = contextStart;
  let endLine = contextEnd;
  if (endLine - startLine + 1 > maxLines) endLine = startLine + maxLines - 1;
  return formatHashlineContent({
    path: input.path,
    tag: input.tag,
    lines: input.lines.slice(startLine - 1, endLine),
    startLine,
  });
}

export function firstHashlinePreview(input: {
  path: string;
  tag: string;
  lines: string[];
  maxLines?: number;
}): string {
  const count = Math.min(input.lines.length, input.maxLines ?? 20);
  return formatHashlineContent({
    path: input.path,
    tag: input.tag,
    lines: input.lines.slice(0, count),
    startLine: count === 0 ? 0 : 1,
  });
}

export function hashlineLinesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function validateHashlineOperations(
  lineCount: number,
  operations: HashlineEditOperation[],
): void {
  if (
    !Array.isArray(operations) ||
    operations.length < 1 ||
    operations.length > 200
  ) {
    throw new HashlineEditConflictError("Hashline edit operations are invalid.");
  }

  const ranges: Array<{ startLine: number; endLine: number }> = [];
  const insertKindsByLine = new Map<number, "insert_before" | "insert_after">();
  for (const operation of operations) {
    switch (operation.op) {
      case "replace":
        validateRange(lineCount, operation.startLine, operation.endLine);
        validateLines(operation.lines);
        ranges.push({ startLine: operation.startLine, endLine: operation.endLine });
        break;
      case "delete":
        validateRange(lineCount, operation.startLine, operation.endLine);
        ranges.push({ startLine: operation.startLine, endLine: operation.endLine });
        break;
      case "insert_before":
      case "insert_after":
        validateInsert(lineCount, operation.op, operation.line);
        validateLines(operation.lines);
        if (operation.lines.length === 0) {
          throw new HashlineEditConflictError("Hashline edit operations are invalid.");
        }
        {
          const existing = insertKindsByLine.get(operation.line);
          if (existing && existing !== operation.op) {
            throw new HashlineEditConflictError(
              "Hashline insert operations conflict at the same line.",
            );
          }
          insertKindsByLine.set(operation.line, operation.op);
        }
        break;
      default:
        throw new HashlineEditConflictError("Hashline edit operations are invalid.");
    }
  }
  ranges.sort((left, right) => left.startLine - right.startLine);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index - 1].endLine >= ranges[index].startLine) {
      throw new HashlineEditConflictError("Hashline edit operations overlap.");
    }
  }
}

function validateRange(
  lineCount: number,
  startLine: number,
  endLine: number,
): void {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > lineCount
  ) {
    throw new HashlineEditConflictError("Hashline edit operations are invalid.");
  }
}

function validateInsert(
  lineCount: number,
  op: "insert_before" | "insert_after",
  line: number,
): void {
  if (!Number.isInteger(line)) {
    throw new HashlineEditConflictError("Hashline edit operations are invalid.");
  }
  if (lineCount === 0) {
    if (op !== "insert_after" || line !== 0) {
      throw new HashlineEditConflictError("Hashline edit operations are invalid.");
    }
    return;
  }
  if (line < 1 || line > lineCount) {
    throw new HashlineEditConflictError("Hashline edit operations are invalid.");
  }
}

function validateLines(lines: string[]): void {
  if (!Array.isArray(lines)) {
    throw new HashlineEditConflictError("Hashline edit operations are invalid.");
  }
  for (const line of lines) {
    if (line.includes("\0") || line.includes("\r") || line.includes("\n")) {
      throw new HashlineEditConflictError("Hashline edit operations are invalid.");
    }
  }
}

function mergeSameAnchorInserts(
  operations: HashlineEditOperation[],
): HashlineEditOperation[] {
  const merged: HashlineEditOperation[] = [];
  for (const operation of operations) {
    if (operation.op !== "insert_before" && operation.op !== "insert_after") {
      merged.push(operation);
      continue;
    }
    const previous = merged[merged.length - 1];
    if (previous?.op === operation.op && previous.line === operation.line) {
      previous.lines.push(...operation.lines);
    } else {
      merged.push({ ...operation, lines: operation.lines.slice() });
    }
  }
  return merged;
}

function anchorLine(operation: HashlineEditOperation): number {
  switch (operation.op) {
    case "replace":
    case "delete":
      return operation.startLine;
    case "insert_before":
    case "insert_after":
      return operation.line;
  }
}
