import { afterEach, describe, expect, it, vi } from "vitest";
import { validateMcpUrl } from "./registry";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MCP URL policy", () => {
  it("rejects invalid and credential-bearing HTTP_SSE URLs", () => {
    expect(() => validateMcpUrl("HTTP_SSE", "not a url")).toThrow(
      "HTTP_SSE MCP connection URL is invalid.",
    );
    expect(() =>
      validateMcpUrl("HTTP_SSE", "https://user:pass@example.com/mcp"),
    ).toThrow("MCP connection URLs must not include credentials.");
  });

  it("requires production HTTP_SSE URLs to use https", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() =>
      validateMcpUrl("HTTP_SSE", "http://localhost:3999/mcp"),
    ).toThrow("HTTP_SSE MCP connections require https:// URLs in production.");
    expect(validateMcpUrl("HTTP_SSE", "https://example.com/mcp")).toBe(
      "https://example.com/mcp",
    );
  });
});
