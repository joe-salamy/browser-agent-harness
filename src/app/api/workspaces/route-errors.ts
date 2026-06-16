import { NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/server/workspaces/access";

const AUTHENTICATION_REQUIRED_MESSAGE = "Authentication required.";

export function workspaceRouteErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus: number,
): NextResponse<{ error: string }> {
  if (
    error instanceof Error &&
    error.message === AUTHENTICATION_REQUIRED_MESSAGE
  ) {
    return NextResponse.json(
      { error: AUTHENTICATION_REQUIRED_MESSAGE },
      { status: 401 },
    );
  }

  if (error instanceof WorkspaceAccessError) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json(
    { error: fallbackMessage },
    { status: fallbackStatus },
  );
}
