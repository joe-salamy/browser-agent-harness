# Audit Summary — Dark Mode System Default Manual Toggle

## Worktree

- Path: `C:/Users/joesa/Code/browser-agent-harness-dark-mode-system-default-manual-toggle`
- Branch: `feature/dark-mode-system-default-manual-toggle`
- Base ref used for audit diff: `master`
- Merge base: `5b0ededa9e739a7013e08d7d3b8ec8e66ffb3fb7`

## Prior implementation summary received

The prior implementation added CSS-variable dark mode with system preference support, a persisted `bah-theme` manual Light/Dark/System toggle, a root-layout FOUC-prevention script, component tests, and Playwright coverage for manual override, persistence, and system-dark palette behavior.

## Skills loaded

- `audit-worktree`: required audit workflow.
- `react-ui-accessibility-reviewer`: changed React UI and accessible theme control.
- `nextjs-app-router-reviewer`: changed `src/app/layout.tsx` and Next App Router behavior.
- `typescript-strict-maintainer`: changed TypeScript/TSX files and strict diagnostics.
- `vitest-playwright-quality-engineer`: added/updated Vitest and Playwright tests.
- `code-reviewer` plus review/spec-compliance references: full diff and plan compliance review.

## Issues found

1. **Playwright theme spec bypassed configured `baseURL` and failed in this worktree.**
   - Evidence: `npx playwright test theme` timed out at `page.goto("http://localhost:3000/")` with `net::ERR_ABORTED` while the web server was configured and probed at `http://127.0.0.1:3000`.
   - Root cause confirmed in `.next/dev/logs/next-development.log`: Next dev blocked `127.0.0.1` dev-resource access and recommended `allowedDevOrigins: ['127.0.0.1']`.
   - Impact: the new E2E test was environment-dependent and left the broader Playwright config's configured origin unfixed.

## Fixes applied

- Added `allowedDevOrigins: ["127.0.0.1"]` to `next.config.ts` so the configured Playwright dev origin hydrates correctly under Next dev.
- Updated `tests/e2e/theme.spec.ts` to use `page.goto("/")` and Playwright's configured `baseURL` instead of hardcoded `localhost`.
- Replaced the manual `browser.newContext({ colorScheme: "dark" })` path with `page.emulateMedia({ colorScheme: "dark" })`, avoiding manual context cleanup and keeping the test on the configured fixture page.
- Removed `networkidle` waits from the theme spec; the locators/assertions provide the needed web-first synchronization.
- Restored generated `next-env.d.ts` after `next dev` rewrote it; it was not committed.

## Audit-changed files

- `next.config.ts`
- `tests/e2e/theme.spec.ts`

## Commit

- Audit fix commit: `7a87098` (`Fix audit findings`)

## Verification run

- `npm run test -- src/app/theme-toggle.test.tsx` — passed, 4 tests.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npx playwright test theme` — first audit run failed before the fix with navigation timeouts; rerun after the fix passed, 2 tests.
- LSP diagnostics for `src/app/theme-toggle.tsx`, `src/app/theme-toggle.test.tsx`, `src/app/layout.tsx`, and `next.config.ts` — OK.

## Residual risks / skipped checks

- Did not manually change the host OS theme. The system-dark path remains covered by Playwright media emulation and CSS variable assertion.
- Did not run unrelated E2E specs; this audit changed only the theme spec and Next dev-origin config.
- `.omp/handoff/` and `.omp/worktree-flow/` remain untracked workflow artifacts by instruction.
