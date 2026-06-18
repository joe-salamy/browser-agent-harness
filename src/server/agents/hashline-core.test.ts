import { describe, expect, it } from "vitest";
import {
  applyHashlineOperations,
  buildHashlineSnapshot,
  createHashlinePreview,
  createHashlineTag,
  firstHashlinePreview,
  HashlineEditConflictError,
  hashlineLinesEqual,
  joinHashlineText,
  splitHashlineText,
} from "./hashline-core";

describe("hashline core", () => {
  it("formats hashline snapshots with deterministic tags and line numbers", () => {
    const tag = createHashlineTag("version-1", "abc123");
    const snapshot = buildHashlineSnapshot({
      fileId: "file-1",
      path: "notes.md",
      contentType: "text/markdown",
      adapter: "text",
      versionId: "version-1",
      sha256: "abc123",
      lines: ["first", "second"],
    });

    expect(snapshot.tag).toBe(tag);
    expect(snapshot.content).toBe(`[notes.md#${tag}]\n1:first\n2:second`);
    expect(snapshot.lineCount).toBe(2);
    expect(snapshot.contentStartLine).toBe(1);
    expect(snapshot.contentEndLine).toBe(2);
    expect(snapshot.truncated).toBe(false);
  });

  it("formats empty snapshots as only the header", () => {
    const snapshot = buildHashlineSnapshot({
      fileId: "file-1",
      path: "empty.txt",
      contentType: "text/plain",
      adapter: "text",
      versionId: "version-1",
      sha256: "abc123",
      lines: [],
    });

    expect(snapshot.lineCount).toBe(0);
    expect(snapshot.contentStartLine).toBe(0);
    expect(snapshot.contentEndLine).toBe(0);
    expect(snapshot.content).toBe(`[empty.txt#${snapshot.tag}]`);
  });

  it("caps snapshot content without changing total line count", () => {
    const snapshot = buildHashlineSnapshot({
      fileId: "file-1",
      path: "long.md",
      contentType: "text/markdown",
      adapter: "text",
      versionId: "version-1",
      sha256: "abc123",
      lines: ["one", "two", "three", "four"],
      startLine: 2,
      endLine: 4,
      maxLines: 2,
    });

    expect(snapshot.lineCount).toBe(4);
    expect(snapshot.contentStartLine).toBe(2);
    expect(snapshot.contentEndLine).toBe(3);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.content).toContain("2:two\n3:three");
    expect(snapshot.content).toContain("[1 lines elided; call read_hashlines");
  });

  it("preserves dominant CRLF and final newline when joining text", () => {
    const parsed = splitHashlineText("one\r\ntwo\r\n");
    expect(parsed).toEqual({
      lines: ["one", "two"],
      newline: "\r\n",
      trailingNewline: true,
    });
    expect(joinHashlineText(["one", "changed"], parsed.newline, true)).toBe(
      "one\r\nchanged\r\n",
    );
    expect(joinHashlineText(["one", ""], "\n", false)).toBe("one\n\n");
  });

  it("applies replace delete and inserts in descending anchor order", () => {
    const result = applyHashlineOperations(["one", "two", "three", "four"], [
      { op: "insert_after", line: 2, lines: ["after-a"] },
      { op: "insert_after", line: 2, lines: ["after-b"] },
      { op: "replace", startLine: 4, endLine: 4, lines: ["FOUR"] },
      { op: "delete", startLine: 1, endLine: 1 },
    ]);

    expect(result.lines).toEqual(["two", "after-a", "after-b", "three", "FOUR"]);
    expect(result.changedStartLine).toBe(1);
  });

  it("allows insert_after line zero only for empty files", () => {
    expect(
      applyHashlineOperations([], [
        { op: "insert_after", line: 0, lines: ["created"] },
      ]).lines,
    ).toEqual(["created"]);
    expect(() =>
      applyHashlineOperations([], [
        { op: "insert_before", line: 0, lines: ["bad"] },
      ]),
    ).toThrow(HashlineEditConflictError);
  });

  it("rejects overlapping ranges and conflicting same-anchor inserts", () => {
    expect(() =>
      applyHashlineOperations(["one", "two", "three"], [
        { op: "replace", startLine: 1, endLine: 2, lines: ["x"] },
        { op: "delete", startLine: 2, endLine: 3 },
      ]),
    ).toThrow("Hashline edit operations overlap.");

    expect(() =>
      applyHashlineOperations(["one", "two"], [
        { op: "insert_before", line: 1, lines: ["x"] },
        { op: "insert_after", line: 1, lines: ["y"] },
      ]),
    ).toThrow("Hashline insert operations conflict at the same line.");
  });

  it("rejects NUL and embedded newline replacement text", () => {
    expect(() =>
      applyHashlineOperations(["one"], [
        { op: "replace", startLine: 1, endLine: 1, lines: ["bad\nline"] },
      ]),
    ).toThrow(HashlineEditConflictError);
    expect(() =>
      applyHashlineOperations(["one"], [
        { op: "replace", startLine: 1, endLine: 1, lines: ["bad\0line"] },
      ]),
    ).toThrow(HashlineEditConflictError);
  });

  it("creates changed-span and no-op previews", () => {
    const tag = "ABCD";
    const changed = createHashlinePreview({
      path: "notes.md",
      tag,
      lines: ["one", "two", "three", "four"],
      changedStartLine: 2,
      changedEndLine: 2,
    });
    expect(changed).toBe("[notes.md#ABCD]\n1:one\n2:two\n3:three");
    expect(firstHashlinePreview({ path: "notes.md", tag, lines: ["one", "two"] })).toBe(
      "[notes.md#ABCD]\n1:one\n2:two",
    );
    expect(hashlineLinesEqual(["one"], ["one"])).toBe(true);
    expect(hashlineLinesEqual(["one"], ["two"])).toBe(false);
  });
});
