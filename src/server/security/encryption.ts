import crypto from "crypto";

const KEY_VERSION = "v1";

function getMasterKey(): Buffer {
  const encoded = process.env.ENCRYPTION_MASTER_KEY;
  if (!encoded) {
    throw new Error("ENCRYPTION_MASTER_KEY is required for model credential encryption.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export async function encryptSecret(plaintext: string): Promise<{
  encryptedSecret: string;
  secretNonce: string;
  secretKeyVersion: string;
}> {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecret: Buffer.concat([encrypted, tag]).toString("base64"),
    secretNonce: nonce.toString("base64"),
    secretKeyVersion: KEY_VERSION,
  };
}

export async function decryptSecret(record: {
  encryptedSecret: string;
  secretNonce: string;
  secretKeyVersion: string;
}): Promise<string> {
  if (record.secretKeyVersion !== KEY_VERSION) {
    throw new Error(`Unsupported secret key version ${record.secretKeyVersion}.`);
  }
  const payload = Buffer.from(record.encryptedSecret, "base64");
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(record.secretNonce, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
