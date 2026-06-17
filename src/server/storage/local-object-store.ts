import { mkdir, open, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { ObjectStore } from "@/server/storage/object-store";

const ROOT = path.join(process.cwd(), ".data", "object-store");
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

function localPathForKey(key: string): string {
  if (
    key.length === 0 ||
    CONTROL_CHAR_PATTERN.test(key) ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key
      .split("/")
      .some(
        (segment) =>
          segment.length === 0 || segment === "." || segment === "..",
      )
  ) {
    throw new Error("Invalid object key.");
  }
  return path.join(ROOT, ...key.split("/"));
}

export class LocalObjectStore implements ObjectStore {
  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const filePath = localPathForKey(input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
  }

  async getObject(input: { key: string }): Promise<Buffer> {
    return readFile(localPathForKey(input.key));
  }

  async getObjectRange(input: {
    key: string;
    start: number;
    endInclusive: number;
  }): Promise<Buffer> {
    if (input.start < 0 || input.endInclusive < input.start) {
      return Buffer.alloc(0);
    }
    const file = await open(localPathForKey(input.key), "r");
    try {
      const length = input.endInclusive - input.start + 1;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, input.start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await rm(localPathForKey(input.key), { force: true });
  }
}
