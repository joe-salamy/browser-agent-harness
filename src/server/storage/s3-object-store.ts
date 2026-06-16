import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStore } from "@/server/storage/object-store";

function boolEnv(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Uint8Array) return Buffer.from(body);
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export class S3ObjectStore implements ObjectStore {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? "workspace-files";
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: boolEnv(process.env.S3_FORCE_PATH_STYLE),
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async getObject(input: { key: string }): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: input.key }),
    );
    return streamToBuffer(response.Body);
  }

  async deleteObject(input: { key: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: input.key }),
    );
  }

  async createSignedDownloadUrl(input: {
    key: string;
    filename: string;
    contentType: string;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `attachment; filename="${input.filename.replaceAll('"', "")}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: 300 });
  }
}
