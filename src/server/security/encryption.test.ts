import { describe, expect, it } from "vitest";
import { assertAuditMetadataSafe } from "@/server/audit/log";
import { decryptSecret, encryptSecret } from "./encryption";

describe("secret encryption", () => {
  it("round trips only through decryptSecret", async () => {
    const encrypted = await encryptSecret("op://secret-value");
    expect(encrypted.encryptedSecret).not.toContain("secret-value");
    await expect(decryptSecret(encrypted)).resolves.toBe("op://secret-value");
  });
});

describe("audit metadata safety", () => {
  it("rejects secret-like metadata fields", () => {
    expect(() =>
      assertAuditMetadataSafe({ nested: { apiKey: "plain" } }),
    ).toThrow(/secret field/);
    expect(() =>
      assertAuditMetadataSafe({ Authorization: "Bearer token" }),
    ).toThrow(/secret field/);
  });

  it("allows non-secret operational metadata", () => {
    expect(() =>
      assertAuditMetadataSafe({
        path: "notes.md",
        model: "openai/gpt-4.1-mini",
      }),
    ).not.toThrow();
  });
});
