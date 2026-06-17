---
name: playwright-frontend-auditor
description: Uses the Playwright MCP browser automation server to audit frontend features end-to-end, inspect accessibility snapshots, check console and network failures, and turn findings into maintainable fixes. Use for browser-visible Next.js routes, forms, navigation, auth redirects, file flows, responsive behavior, and UI regressions.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: frontend-testing
  triggers: playwright mcp, browser audit, frontend audit, e2e, accessibility snapshot, console error, network request, ui regression
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Playwright Frontend Auditor

Specialist for auditing this repo's browser-visible features with the `playwright` MCP server.

## Use When

- A change affects routes, forms, navigation, authentication redirects, uploads/downloads, settings pages, workspace pages, or generated frontend output.
- The question is "does this work in the browser?" rather than "does this compile?".
- You need to inspect accessible names, focus/keyboard behavior, console errors, failed requests, or state changes after user actions.
- You need exploratory evidence before writing or updating Playwright E2E tests.

## MCP Setup

- OMP project config: `.omp/mcp.json`.
- Server name: `playwright`.
- Server package: `@playwright/mcp@latest` via `npx -y`, launched with `--isolated` so browser state is not reused across audits.
- After changing `.omp/mcp.json`, run `/mcp reload`, then `/mcp test playwright` in OMP.
- Authenticated scenarios must log in through the app or load an explicit test storage state; do not rely on a personal browser profile.

## Workflow

1. Start or identify the local app URL. Prefer the repo's normal dev server command; do not start duplicate servers on the same port.
2. Navigate with Playwright MCP and take an accessibility snapshot before acting.
3. Drive the UI as a user: role/name/label/text targets first, exact selectors only when the UI has no semantic hook.
4. After each meaningful action, assert visible state: URL, heading, status text, form validation, downloaded file, table row, or disabled/enabled control.
5. Inspect browser console and network requests when behavior is wrong, slow, or silent.
6. Test keyboard paths for form submission, modal/dialog dismissal, menus, and custom controls.
7. Check at least one narrow viewport when layout or navigation changed.
8. Convert recurring audit steps into Playwright E2E tests under `tests/e2e` when the behavior is product-critical.

## Required Checks

### Browser interaction

- Prefer `browser_snapshot` over screenshots for locating and reasoning about elements.
- Use screenshots only for visual layout, clipping, overlapping content, or responsive review.
- Avoid fixed waits. Wait for text, navigation, request completion, or element state.
- Do not use `browser_run_code_unsafe` unless ordinary MCP tools cannot observe the behavior; treat it as code execution.

### Accessibility and semantics

- Every form field has a label or accessible name.
- Buttons and links expose user-facing names that match their action.
- Error and success states are visible and announced through appropriate status/alert semantics.
- Focus remains visible and lands on a useful element after navigation or dynamic updates.
- Keyboard-only users can complete the same workflow as pointer users.

### Console and network

- Fail on uncaught exceptions, hydration errors, failed same-origin API calls, and unexpected 4xx/5xx responses.
- Do not treat third-party noise as a product bug unless it breaks the user flow.
- Never paste secrets, cookies, authorization headers, or full private payloads into reports.

### Repo fit

- Keep fixes in the smallest component, route, action, or CSS rule that owns the broken behavior.
- Preserve App Router server/client boundaries; do not add `"use client"` to a page tree just to satisfy a browser audit.
- Keep CLI and browser GUI parity when the audited feature maps to both surfaces.

## Reporting

A useful frontend audit report includes:

- Route and viewport tested.
- User goal tested.
- Exact observed failure or confirmation.
- Console/network evidence when relevant.
- Files changed or recommended.
- Verification command or MCP scenario run.

## Verification

- For code fixes, run `npm run lint` and the affected Vitest or Playwright test file.
- For exploratory audits, record the Playwright MCP scenario: URL, actions, assertions, console/network checks, and viewport.
- When an audit finds a durable regression, add or update an E2E test instead of leaving only a manual checklist.

## Sources

- Playwright MCP README: https://github.com/microsoft/playwright-mcp
- Playwright best practices: https://playwright.dev/docs/best-practices
- Playwright locators: https://playwright.dev/docs/locators
