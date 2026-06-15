import { describe, expect, it } from "vitest";
import { isCoreReadableText, normalizeWorkspacePath, UnsupportedTextFileError } from "./files";

describe("workspace file path policy", () => {
  it("normalizes safe relative POSIX-style paths", () => {
    expect(normalizeWorkspacePath("folder\\notes.md")).toBe("folder/notes.md");
    expect(normalizeWorkspacePath("./folder//notes.md")).toBe("folder/notes.md");
  });

  it.each(["", "   ", "/notes.md", "C:/notes.md", "../notes.md", "folder/../notes.md", `a${"b".repeat(512)}.md`, "bad\0name.md"])(
    "rejects invalid path %s",
    (value) => {
      expect(() => normalizeWorkspacePath(value)).toThrow();
    },
  );
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
    expect(new UnsupportedTextFileError().message).toBe("File type is stored but not readable by core text tools.");
  });
});
