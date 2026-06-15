import { mkdir, readFile, rm, writeFile } from "fs/promises";
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
    key.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid object key.");
  }
  return path.join(ROOT, ...key.split("/"));
}

export class LocalObjectStore implements ObjectStore {
  async putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    const filePath = localPathForKey(input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
  }

  async getObject(input: { key: string }): Promise<Buffer> {
    return readFile(localPathForKey(input.key));
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await rm(localPathForKey(input.key), { force: true });
  }

  async createSignedDownloadUrl(input: { key: string; filename: string; contentType: string }): Promise<string> {
    localPathForKey(input.key);
    const params = new URLSearchParams({ key: input.key, filename: input.filename, contentType: input.contentType });
    return `/api/object-download?${params.toString()}`;
  }
}
