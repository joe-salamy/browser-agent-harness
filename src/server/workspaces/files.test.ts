import { describe, expect, it } from "vitest";
import {
  isCoreReadableText,
  normalizeContentType,
  normalizeWorkspacePath,
  UnsupportedTextFileError,
} from "./files";

describe("workspace file path policy", () => {
  it("normalizes safe relative POSIX-style paths", () => {
    expect(normalizeWorkspacePath("folder\\notes.md")).toBe("folder/notes.md");
    expect(normalizeWorkspacePath("./folder//notes.md")).toBe(
      "folder/notes.md",
    );
  });

  it.each([
    "",
    "   ",
    "/notes.md",
    "C:/notes.md",
    "C:notes.md",
    "folder/C:notes.md",
    "../notes.md",
    "folder/../notes.md",
    `a${"b".repeat(512)}.md`,
    "bad\0name.md",
    "line\nbreak.md",
    "bad\u007fname.md",
  ])("rejects invalid path %s", (value) => {
    expect(() => normalizeWorkspacePath(value)).toThrow();
  });
});

describe("workspace file content type policy", () => {
  it("normalizes supported MIME values", () => {
    expect(normalizeContentType(" Text/Plain; Charset=UTF-8 ")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it.each([
    "",
    "plain",
    "text/plain\r\nx-evil: yes",
    `text/${"a".repeat(260)}`,
  ])("rejects invalid content type %s", (value) => {
    expect(() => normalizeContentType(value)).toThrow("Invalid content type.");
  });
});

describe("core readable text policy", () => {
  it.each([
    ["notes.md", "application/octet-stream"],
    ["notes.txt", "application/octet-stream"],
    ["data.json", "application/json"],
    ["table.csv", "text/csv"],
    ["plain.bin", "text/plain; charset=utf-8"],
  ])("accepts supported text file %s", (filePath, contentType) => {
    expect(isCoreReadableText(filePath, contentType)).toBe(true);
  });

  it("keeps unsupported binary files stored-only for core text tools", () => {
    expect(isCoreReadableText("scan.pdf", "application/pdf")).toBe(false);
    expect(new UnsupportedTextFileError().message).toBe(
      "File type is stored but not readable by core text tools.",
    );
  });
});
