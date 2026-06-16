export interface ObjectStore {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  getObject(input: { key: string }): Promise<Buffer>;
  deleteObject(input: { key: string }): Promise<void>;
  createSignedDownloadUrl(input: {
    key: string;
    filename: string;
    contentType: string;
  }): Promise<string>;
}
