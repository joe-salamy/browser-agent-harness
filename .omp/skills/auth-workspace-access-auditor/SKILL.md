---
name: auth-workspace-access-auditor
description: Audits and improves authentication, authorization, workspace role enforcement, and Auth.js/NextAuth session handling in this repo. Use for src/lib/auth.ts, workspace access checks, requireUserId/getCurrentUserId callsites, membership logic, protected pages, protected Route Handlers, and OWNER/EDITOR/VIEWER role changes.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: authz
  triggers: auth, authorization, nextauth, auth.js, workspace access, role, requireUserId, assertWorkspaceAccess, OWNER, EDITOR, VIEWER
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Auth and Workspace Access Auditor

Specialist for Auth.js/NextAuth sessions and workspace-scoped authorization in this repo.

## Use When

- Changing `src/lib/auth.ts`, `src/server/workspaces/access.ts`, membership logic, route protection, or role gates.
- Reviewing a feature that reads or mutates workspace data.
- Investigating cross-workspace data leaks, privilege escalation, or auth redirect behavior.

## Repo Context

- Auth helpers: `getCurrentUserId()` and `requireUserId()` in `src/lib/auth.ts`.
- Workspace roles are Prisma enum values: `OWNER`, `EDITOR`, `VIEWER`.
- Server services should call `assertWorkspaceAccess(userId, workspaceId, requiredRole)` before data access.
- Protected API routes should authenticate at the route boundary and authorize in the service layer.

## Workflow

1. Inventory entry points: pages, Route Handlers, Server Actions, service methods, tests.
2. For each entry point, identify actor, workspace, target resource, required role, and final side effect.
3. Trace from request to Prisma query. Confirm the same `userId` and `workspaceId` are used throughout; no trusting client-submitted owner or role fields.
4. Verify object-level authorization: `fileId`, `credentialId`, `connectionId`, `agentRunId`, and audit targets must be scoped to the workspace before mutation or return.
5. Check role monotonicity: OWNER can do all OWNER/EDITOR/VIEWER operations; EDITOR can mutate allowed workspace content but not credentials or connections unless explicitly permitted; VIEWER reads only.
6. Review returned data and errors for account enumeration, workspace existence leaks, and secret disclosure.
7. Add or update tests that prove forbidden actors fail and allowed actors still succeed.

## Required Checks

### Authentication

- Protected pages redirect unauthenticated users before loading private data.
- Protected API routes return 401 or a safe redirect path for unauthenticated users.
- `getServerSession(authOptions)` is only used server-side.
- Session callbacks expose only stable user identity needed by the app; avoid emails, roles, or secrets unless required.

### Authorization

- Every workspace read requires at least `WorkspaceRole.VIEWER`.
- Every workspace content mutation requires at least `WorkspaceRole.EDITOR`.
- Workspace-level credential, MCP connection, permission, owner, and membership administration requires `WorkspaceRole.OWNER` unless the product explicitly says otherwise.
- A resource lookup by ID must include `workspaceId` in the `where` clause or be preceded by a lookup that proves workspace ownership.
- `updateMany`/`deleteMany` must include workspace and target scope and must check affected count when missing target should fail.

### Input trust

- Never accept `userId`, `ownerId`, `createdById`, `role`, `isDefault`, `workspaceId`, or provider values from the client without server-side authorization.
- Treat hidden form fields as attacker-controlled.
- Normalize IDs and paths before authorization-dependent queries.

### Error handling

- Do not reveal whether a workspace, file, credential, or MCP connection exists to unauthorized users unless product behavior requires it.
- Avoid returning raw auth/provider/database errors to the browser.
- Write audit logs after successful authorization; avoid logging secrets or raw credential values.

## Improvement Defaults

- Centralize repeated gates in `src/server/workspaces/access.ts` or nearby service functions.
- Keep auth checks close to data access, not just UI controls.
- Prefer explicit role comparisons over broad booleans like `canEdit` when changing security-sensitive code.
- Favor tests that model two users and two workspaces to catch missing `workspaceId` filters.

## Verification

- Run unit/integration tests for changed server modules, especially `access.test.ts` and affected `*.test.ts` files.
- Add regression tests for denied access before fixing a privilege bug.
- Run `npm run lint` after auth or route changes.

## Sources

- Auth.js protecting resources: https://authjs.dev/getting-started/session-management/protecting
- Next.js data security guide: https://nextjs.org/docs/app/guides/data-security
