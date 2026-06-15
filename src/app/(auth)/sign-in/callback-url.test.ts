import { describe, expect, it } from "vitest";
import { getSafeSignInCallbackUrl } from "./callback-url";

describe("getSafeSignInCallbackUrl", () => {
  it("allows relative in-app callback URLs", () => {
    expect(getSafeSignInCallbackUrl("/workspaces/ws_123?fileId=file_123")).toBe("/workspaces/ws_123?fileId=file_123");
  });

  it.each([null, "", "https://example.com", "//example.com", "javascript:alert(1)", "/\\example.com"])(
    "falls back for unsafe callback URL %s",
    (callbackUrl) => {
      expect(getSafeSignInCallbackUrl(callbackUrl)).toBe("/workspaces");
    },
  );
});
