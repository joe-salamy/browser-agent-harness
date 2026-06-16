import { describe, expect, it } from "vitest";
import { LocalObjectStore } from "./local-object-store";

describe("local object store key policy", () => {
  it.each([
    "",
    "/absolute",
    "../escape",
    "safe/../escape",
    "safe//file",
    "safe\\file",
    "..\\escape",
    "safe\\..\\escape",
    "line\nbreak",
  ])("rejects unsafe object key %s", async (key) => {
    const store = new LocalObjectStore();

    await expect(
      store.putObject({
        key,
        body: Buffer.alloc(0),
        contentType: "application/octet-stream",
      }),
    ).rejects.toThrow("Invalid object key.");
    await expect(
      store.createSignedDownloadUrl({
        key,
        filename: "file.txt",
        contentType: "application/octet-stream",
      }),
    ).rejects.toThrow("Invalid object key.");
  });
});
