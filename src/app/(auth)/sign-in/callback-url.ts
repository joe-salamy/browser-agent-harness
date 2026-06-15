const DEFAULT_SIGN_IN_CALLBACK_URL = "/workspaces";

export function getSafeSignInCallbackUrl(callbackUrl: string | null): string {
  if (!callbackUrl) return DEFAULT_SIGN_IN_CALLBACK_URL;
  if (callbackUrl[0] !== "/") return DEFAULT_SIGN_IN_CALLBACK_URL;
  if (callbackUrl[1] === "/") return DEFAULT_SIGN_IN_CALLBACK_URL;
  if (callbackUrl.includes("\\")) return DEFAULT_SIGN_IN_CALLBACK_URL;
  return callbackUrl;
}
