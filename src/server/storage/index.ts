import type { ObjectStore } from "@/server/storage/object-store";
import { LocalObjectStore } from "@/server/storage/local-object-store";
import { S3ObjectStore } from "@/server/storage/s3-object-store";

let store: ObjectStore | undefined;

export function getObjectStore(): ObjectStore {
  if (!store) {
    store = process.env.S3_ENDPOINT ? new S3ObjectStore() : new LocalObjectStore();
  }
  return store;
}

export function setObjectStoreForTests(nextStore: ObjectStore | undefined): void {
  store = nextStore;
}
