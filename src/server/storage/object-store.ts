export interface ObjectStore {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  getObject(input: { key: string }): Promise<Buffer>;
  getObjectRange(input: {
    key: string;
    start: number;
    endInclusive: number;
  }): Promise<Buffer>;
  deleteObject(input: { key: string }): Promise<void>;
}
