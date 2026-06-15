---
name: typescript-strict-maintainer
description: Audits and improves strict TypeScript maintainability in this repo, including type boundaries, DTOs, discriminated unions, exhaustive handling, async errors, imports, module boundaries, and no-copy/no-allocation cleanup. Use for TypeScript refactors, exported symbol changes, type errors, unsafe casts, nullability bugs, and API shape changes.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: typescript
  triggers: typescript, strict, type error, refactor, dto, discriminated union, unsafe cast, nullability, exported symbol
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# TypeScript Strict Maintainer

Specialist for strict TypeScript correctness and maintainability across this repo.

## Use When

- Changing exported types, service APIs, route payloads, DTOs, adapters, or Prisma-derived types.
- Fixing type errors, unsafe casts, nullability bugs, async error handling, or dead code.
- Refactoring TypeScript without changing product behavior.

## Repo Context

- `tsconfig.json` has `strict: true`, `isolatedModules: true`, `moduleResolution: bundler`, and alias `@/* -> src/*`.
- Runtime code is TypeScript only; `allowJs` is false.
- App Router and server modules mix React Server Components, Route Handlers, Server Actions, Prisma Client, and Node APIs.
- Tests use Vitest and Playwright.

## Workflow

1. Locate symbol definitions with LSP before changing exported APIs. Run references for exported symbols.
2. Identify boundary types: external request input, form data, route params, Prisma records, DTOs, provider responses, and UI props.
3. Validate untyped inputs at the boundary; keep internal functions typed with narrow, already-validated values.
4. Replace unsafe casts with parsing, guards, `satisfies`, discriminated unions, or exact DTO builders.
5. Preserve strict nullability. Handle `null`/`undefined` at the boundary instead of using non-null assertions.
6. Remove dead compatibility shims, aliases, unused helpers, and broad abstractions during clean cutovers.
7. Run type/lint/tests that cover the changed symbols.

## Required Checks

### Types and boundaries

- Do not use `any` unless interacting with unavoidable external unknowns; isolate and immediately narrow it.
- Prefer `unknown` for untrusted external data.
- Parse `FormData`, JSON, route params, and provider responses into explicit types before business logic.
- Use DTO types for data crossing server-to-client or API boundaries.
- Do not expose Prisma model types directly as client props when they include fields the UI does not need.

### Exports and refactors

- Use LSP rename for cross-file symbol rename when available.
- Run LSP references before changing exported functions, classes, constants, types, or enum-like values.
- Remove old names after migration; do not leave aliases or deprecated wrappers unless the user explicitly requires compatibility.
- Keep module boundaries clear: UI imports services through stable APIs, not deep internal implementation details.

### Control flow

- Use discriminated unions for run status, provider results, storage results, and validation outcomes when states diverge.
- Use exhaustive checks for enum/status switches that affect persistence, auth, or UI states.
- Avoid boolean parameter traps in exported APIs; use named object parameters for multi-option service calls.
- Prefer early returns for validation and access checks at request boundaries.

### Async and errors

- Await promises that affect persistence, audit logs, or response data.
- Preserve error causes internally, but return sanitized errors to clients.
- Avoid swallowing errors unless the fallback is explicit and tested.
- Do not perform expensive work or network calls inside database transactions unless required and safe.

### Performance and allocation

- Avoid unnecessary array/object copies on hot request paths.
- Use `select`/DTO construction to avoid allocating and serializing fields that will be discarded.
- Do not stringify large objects for logs or errors.
- Keep helper functions pure and allocation-light when called per file, per row, or per request.

## Improvement Defaults

- Prefer exact object types and `satisfies` for config/constants.
- Prefer small pure parsers over scattered inline coercion.
- Prefer narrow service APIs over passing whole Prisma records or request objects.
- Delete code that no longer has a caller after a refactor.

## Verification

- Run `npx tsc --noEmit` for broad type changes.
- Run `npm run lint` for import/React/Next rules.
- Run affected tests for behavior changes.

## Sources

- TypeScript handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- Next.js TypeScript docs: https://nextjs.org/docs/app/api-reference/config/typescript
