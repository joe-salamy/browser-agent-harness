import { describe, expect, it } from "vitest";
import { createZip } from "./zip";

describe("workspace ZIP export paths", () => {
  it("creates archives for canonical workspace-relative entries", () => {
    const archive = createZip([{ path: "folder/notes.md", bytes: Buffer.from("hello") }]);

    expect(archive.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(archive.includes(Buffer.from("folder/notes.md"))).toBe(true);
  });

  it.each([
    "",
    "/absolute.txt",
    "../escape.txt",
    "folder/../escape.txt",
    "folder//name.txt",
    "folder\\name.txt",
    "C:drive.txt",
    "folder/C:drive.txt",
    "line\nbreak.txt",
  ])(
    "rejects unsafe ZIP entry path %s",
    (entryPath) => {
      expect(() => createZip([{ path: entryPath, bytes: Buffer.alloc(0) }])).toThrow();
    },
  );
});
