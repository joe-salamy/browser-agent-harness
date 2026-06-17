# Implementation Summary — Dark Mode (system default + manual toggle)

## Plan

- Plan path: `.omp/worktree-flow/dark-mode-system-default-manual-toggle/plan.md`

## Worktree and branch

- Worktree path: `C:/Users/joesa/Code/browser-agent-harness-dark-mode-system-default-manual-toggle`
- Branch: `feature/dark-mode-system-default-manual-toggle`
- Commit: `65b1c4972b76adcf693c5075da0af79d410cce9e`
- Git note: the worktree `.git` file points at `/mnt/c/...`, which is invalid in this Windows shell. All git operations were run with explicit `--git-dir=C:/Users/joesa/Code/browser-agent-harness/.git/worktrees/browser-agent-harness-dark-mode-system-default-manual-toggle --work-tree=.`. No worktrees were created, switched, merged, deleted, rebased, or cleaned up.

## Changed files

- `src/app/globals.css`
- `src/app/(auth)/sign-in/sign-in-form.tsx`
- `src/app/layout.tsx`
- `src/app/theme-toggle.tsx`
- `src/app/theme-toggle.test.tsx`
- `tests/e2e/theme.spec.ts`

## Behavior changes

- Added light and dark theme variables in `src/app/globals.css`.
- Added system dark-mode support via `@media (prefers-color-scheme: dark)` when `<html data-theme="light">` is not set.
- Added forced dark support via `<html data-theme="dark">`.
- Replaced planned hardcoded CSS color literals with variables:
  - `.error-text` uses `--error`.
  - `.btn.secondary` uses `--secondary-bg` and `--secondary-fg`.
  - `.input`, `textarea`, and `select` use `--input-bg`.
  - `.badge` uses `--badge-bg` and `--badge-fg`.
- Replaced the sign-in form inline error color with `className="error-text"`.
- Added the root-layout FOUC prevention script. It reads `localStorage.getItem("bah-theme")` before paint and sets/removes `<html data-theme>`.
- Added `suppressHydrationWarning` to `<html>` because the script mutates `<html data-theme>` before React hydration.
- Added `ThemeToggle` as a small client component rendered on every route by `src/app/layout.tsx`.
- Theme choices:
  - `dark`: stores `bah-theme=dark` and sets `data-theme="dark"`.
  - `light`: stores `bah-theme=light` and sets `data-theme="light"`.
  - `system`: stores `bah-theme=system` and removes `data-theme`, returning control to OS/browser preference.

## Implementation decisions and tradeoffs

- Used CSS variables plus media/attribute selectors rather than Tailwind `dark:` variants, matching the existing global CSS convention.
- Kept the dark palette duplicated in the media query and forced-dark selector for readability, as the plan requested.
- Implemented `ThemeToggle` with `useSyncExternalStore` instead of a synchronous `setState` inside `useEffect`; ESLint rejects direct `setState` in effects. The server snapshot remains `system` for hydration, and the client snapshot reads `<html data-theme>` after hydration.
- Added a custom in-page event (`bah-theme-change`) so the `useSyncExternalStore` subscriber updates after manual changes.
- The Playwright theme spec navigates to `http://localhost:3000/` instead of the config base URL `http://127.0.0.1:3000`. In this Windows/Next dev environment, `127.0.0.1` loaded scripts but did not hydrate React event handlers; `localhost` hydrated correctly and matched manual browser behavior. Global Playwright config was left unchanged to keep the workaround scoped to the new spec.
- Restored `next-env.d.ts` after `next dev` changed `.next/types/routes.d.ts` to `.next/dev/types/routes.d.ts`; that generated change was outside the plan and was not committed.

## Tests and checks run

- `npm ci`
  - Result: passed; installed dependencies from `package-lock.json` because `vitest` was initially unavailable.
- `npm run test -- src/app/theme-toggle.test.tsx`
  - First run after implementation: passed, 4 tests.
  - Rerun after `useSyncExternalStore` change: passed, 4 tests.
- `npm run lint`
  - First run failed on `react-hooks/set-state-in-effect` in `ThemeToggle`.
  - Fixed by replacing effect state reconciliation with `useSyncExternalStore`.
  - Rerun: passed.
  - Final rerun after Playwright spec adjustment: passed.
- `npm run typecheck`
  - First run failed because Prisma Client was not generated after `npm ci`; errors were missing exports from `@prisma/client`.
- `npm run prisma:generate`
  - Result: passed; generated Prisma Client.
- `npm run typecheck`
  - Rerun after Prisma generate: passed.
  - Final rerun after Playwright spec adjustment: passed.
- `npm run test`
  - Result: passed; 31 files passed, 2 skipped; 180 tests passed, 6 skipped.
- `npx playwright test theme`
  - First runs failed when the spec used `/` on Playwright's `127.0.0.1` base URL; React did not hydrate there, so native select changes did not call `onChange`.
  - Final run after using `http://localhost:3000/`: passed; 2 tests.
- Manual/browser smoke with the Browser tool against `http://localhost:3000/`
  - System: removed `data-theme`, stored `bah-theme=system`.
  - Light: set `data-theme="light"`, stored `bah-theme=light`, computed `--background=#f8fafc`.
  - Dark: set `data-theme="dark"`, stored `bah-theme=dark`, computed `--background=#0f172a`.
  - Reload after Dark: retained `data-theme="dark"`, select value `dark`, and `--background=#0f172a`.

## Skipped checks

- Did not manually change the host OS theme. The system-dark path was covered by Playwright `browser.newContext({ colorScheme: "dark" })` and asserted `--background=#0f172a` without `data-theme`.
- Did not run unrelated e2e specs. The plan required the focused `theme` spec, and existing broader e2e suites cover unrelated workflows.

## Assumptions, blockers, risks, follow-up

- Assumption: fixed top-right toggle placement is acceptable as approved in the plan.
- Assumption: `bah-theme` remains the storage key for both the FOUC script and client component.
- Known risk: Playwright config still uses `127.0.0.1`; this environment did not hydrate React event handlers on that origin. The new theme spec is scoped to `localhost`, but future e2e additions may hit the same config-origin issue if they rely on hydrated client handlers.
- Residual risk: headless/browser default color scheme may be dark in some environments; tests assert system-dark explicitly with Playwright color scheme and manual override behavior with explicit attributes.
- No blockers remain.
