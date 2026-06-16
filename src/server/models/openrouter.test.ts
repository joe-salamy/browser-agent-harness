import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPENROUTER_MODEL,
  getSafeOpenRouterErrorMessage,
  resolveOpenRouterModel,
} from "./openrouter";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenRouter model policy", () => {
  it("uses the deployment default when no override is provided", () => {
    expect(resolveOpenRouterModel()).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(resolveOpenRouterModel("   ")).toBe(DEFAULT_OPENROUTER_MODEL);
  });

  it("rejects unallowlisted model overrides", () => {
    vi.stubEnv("OPENROUTER_ALLOWED_MODELS", "anthropic/claude-sonnet-4");

    expect(() => resolveOpenRouterModel("openai/gpt-4.1-mini")).not.toThrow();
    expect(resolveOpenRouterModel("anthropic/claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4",
    );
    expect(() =>
      resolveOpenRouterModel("untrusted/provider-selected-model"),
    ).toThrow("OpenRouter model is not allowed for this deployment.");
  });

  it("rejects malformed configured model ids", () => {
    vi.stubEnv("OPENROUTER_ALLOWED_MODELS", "valid/model,bad model");

    expect(() => resolveOpenRouterModel("valid/model")).toThrow(
      "Configured OpenRouter model allowlist contains an invalid model id.",
    );
  });
});

describe("OpenRouter error handling", () => {
  it("returns status-only provider errors without leaking provider messages", () => {
    expect(
      getSafeOpenRouterErrorMessage({
        status: 401,
        message: "bad key sk-secret",
      }),
    ).toBe("OpenRouter request failed with status 401.");
    expect(getSafeOpenRouterErrorMessage(new Error("bad key sk-secret"))).toBe(
      "OpenRouter request failed.",
    );
  });
});
