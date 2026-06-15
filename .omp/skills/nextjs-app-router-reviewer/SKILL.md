---
name: nextjs-app-router-reviewer
description: Audits and improves Next.js App Router code in this repo, including Server Components, Server Actions, Route Handlers, cache boundaries, redirects, form handling, and server/client data flow. Use for changes under src/app, route.ts files, actions.ts, page.tsx, layout.tsx, or when reviewing data exposure across React Server Components.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: nextjs
  triggers: nextjs, app router, server action, route handler, server component, src/app, actions.ts, page.tsx
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Next.js App Router Reviewer

Specialist for this repo's `src/app` surface: App Router pages, nested routes, Route Handlers, Server Actions, redirects, form posts, and data crossing server/client boundaries.

## Use When

- Reviewing or changing `src/app/**/page.tsx`, `layout.tsx`, `route.ts`, `actions.ts`, or client components.
- Adding data fetching, mutations, redirects, form handling, or route-handler responses.
- Auditing whether private workspace, user, credential, audit, or file data can leak into client props.

## Repo Context

- Framework: Next.js App Router with React Server Components.
- Server actions live in `src/app/workspaces/actions.ts` and call server modules.
- Auth helpers live in `src/lib/auth.ts`.
- Database and business logic should stay behind `src/server/**` or `src/lib/**` server-only modules.
- API routes use `NextResponse` under `src/app/api/**/route.ts`.

## Workflow

1. Map entry points: pages, layouts, client components, route handlers, server actions, redirects.
2. Classify every file as server-only or client-capable. A file with `"use client"` must not import Prisma, auth server helpers, secrets, Node APIs, or server modules.
3. Trace data returned to JSX props and JSON responses. Check that only DTO-shaped data leaves the server, not full Prisma records with secrets or internal IDs unless intended.
4. For mutations, treat Server Actions and Route Handlers as public POST endpoints. Verify authentication, authorization, input validation, and error shape inside the server-side entry point or the first called service.
5. Check navigation behavior: `redirect()` after auth misses, stable paths after mutations, and `revalidatePath()` only where stale UI can occur.
6. Review caching and dynamic behavior. Do not cache per-user/workspace data unless the cache key includes the user/workspace and authorization is inside the cached function.
7. Improve by moving reusable rules into `src/server/**` services, not duplicating authorization or Prisma queries in UI files.

## Checks

### Data security

- Prefer a Data Access Layer style: server modules perform authorization and return minimal DTOs.
- Never pass raw `User`, `ModelCredential`, `Session`, `WorkspaceMember`, `AuditLog.metadataJson`, encrypted secret fields, API keys, object keys, or presigned URLs into Client Components unless explicitly safe.
- Environment variables belong in server modules only. `NEXT_PUBLIC_` is public by definition.
- Consider `server-only` imports for modules that must never enter the client bundle.

### Route Handlers

- Every handler touching workspace data calls `requireUserId()` and a service that calls `assertWorkspaceAccess()` with the minimum role.
- Use status codes consistently: 401 unauthenticated, 403 unauthorized, 404 unknown resource when hiding existence is desired, 400 validation failure.
- Avoid returning raw exception messages where they can reveal secrets, storage keys, provider details, or internal schema.
- Validate `FormData` and JSON payloads with explicit types or `zod`; do not rely on `String(value)` for security-sensitive IDs or enum-like values.

### Server Actions

- Keep `"use server"` files thin. The action validates form shape, calls a server service, then redirects or revalidates.
- Do not trust hidden form fields for authority. Re-check user, workspace, role, target ID, and ownership in the service.
- Avoid side effects before validation and access checks.

### Server and Client Components

- Client components receive primitive or minimal object props and emit events/forms only.
- Server components may query data, but should still call server services that enforce access.
- Do not introduce client state for server-derived authorization decisions.

## Improvement Defaults

- Move repeated query/access logic from `src/app/**` into `src/server/**`.
- Create narrow DTOs instead of broad `include` trees.
- Prefer explicit branching over clever helpers at request boundaries.
- Keep components boring: render data, submit forms, no hidden security logic.

## Verification

- Run `npm run lint` for App Router/type lint changes.
- Run `npm run test` when server services or actions change.
- Run targeted Playwright tests for end-to-end user flows, especially auth redirects, uploads, downloads, settings changes, and agent runs.

## Sources

- Next.js data security guide: https://nextjs.org/docs/app/guides/data-security
- Next.js App Router docs: https://nextjs.org/docs/app
