---
name: vitest-playwright-quality-engineer
description: Designs, audits, and improves tests for this repo using Vitest, Testing Library, jsdom/node environments, and Playwright E2E. Use when adding or reviewing unit, integration, component, and E2E tests; reproducing bugs; improving brittle tests; and validating auth/workspace/file/model/MCP flows.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: testing
  triggers: test, vitest, playwright, testing-library, e2e, regression, flaky, coverage
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Vitest and Playwright Quality Engineer

Specialist for behavior-focused tests in this Next.js/TypeScript repo.

## Use When

- Adding or reviewing tests for server services, route handlers, Server Actions, React UI, or full user flows.
- Reproducing bugs before fixing them.
- Reducing brittle tests, over-mocking, or implementation-coupled assertions.
- Deciding between Vitest, Testing Library, integration tests, and Playwright.

## Repo Context

- Unit/integration tests: Vitest via `npm run test`.
- Vitest environment defaults to `node`; setup is in `vitest.setup.ts`.
- E2E tests: Playwright under `tests/e2e` via `npm run test:e2e`.
- Existing server tests cover workspace files, access, and encryption.
- App uses Prisma/Postgres, Auth.js, Server Actions, Route Handlers, object storage, model providers, and MCP registry.

## Workflow

1. State the behavior risk in one sentence. Tests must target behavior a user, service consumer, or attacker can observe.
2. Choose the smallest test level that proves the invariant:
   - Pure helper: Vitest unit test.
   - Prisma/service behavior: Vitest integration test with real or existing test database pattern.
   - React rendering/form behavior: Testing Library.
   - Browser navigation/auth/upload/download/workspace flow: Playwright.
3. Write the failing or missing regression test first when fixing a bug.
4. Avoid mocks unless the dependency is external, nondeterministic, slow, or already abstracted behind a repo interface.
5. Assert outcomes, not plumbing. Prefer database rows, returned DTOs, visible text, downloaded bytes, status codes, audit log entries, and role-based denial.
6. Cover edge cases: unauthenticated, unauthorized, cross-workspace target, invalid input, duplicate/concurrent writes, missing resource, revoked credential, binary file, oversized/truncated context.
7. Run only the affected tests during development, then the appropriate broader command before yielding.

## Test Selection

### Use Vitest for

- Pure helpers: path normalization, text file detection, encryption round trips, DTO mappers.
- Server services: access checks, Prisma mutations, audit logs, storage adapter contract.
- Route handler logic when directly invokable without browser semantics.

### Use Testing Library for

- Component semantics: roles, labels, errors, buttons, forms, pending state.
- Client component behavior and keyboard interaction.
- Rendering branches from controlled props.

### Use Playwright for

- Login/sign-in redirects and protected routes.
- Workspace creation, upload/download/export, text save, model settings, MCP settings, and agent runs.
- Behavior that depends on browser form submission, navigation, cookies, or downloads.

## Required Checks

- Tests should fail for the bug they protect against; avoid assertions that pass with a no-op implementation.
- Query UI by role, label, placeholder, or visible text, not CSS class or implementation IDs unless no user-facing hook exists.
- Do not snapshot large UI trees or generated text unless exact formatting is the behavior.
- Do not assert default strings/config values unless the behavior is the string itself.
- Do not mock Prisma or auth for access-control tests if the real integration pattern exists.
- Keep fixtures minimal and named for the behavior they represent.
- Clean up database/object-store state or use isolated records to prevent order dependence.

## Flake Resistance

- In Playwright, use locators and web-first assertions; avoid fixed sleeps.
- Assert navigation and downloaded content explicitly.
- Seed required state through existing app/service paths where possible.
- Keep tests independent; one test should not rely on another test's created state.

## Verification Commands

- Targeted Vitest file: `npm run test -- path/to/file.test.ts`.
- All Vitest: `npm run test`.
- E2E: `npm run test:e2e`.
- Lint after test or source edits: `npm run lint`.

## Sources

- Testing Library guiding principles: https://testing-library.com/docs/guiding-principles
- Playwright best practices: https://playwright.dev/docs/best-practices
- Vitest guide: https://vitest.dev/guide/
