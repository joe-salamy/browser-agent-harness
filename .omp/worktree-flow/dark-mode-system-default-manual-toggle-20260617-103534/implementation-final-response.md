Implemented and committed.

Commit: `65b1c4972b76adcf693c5075da0af79d410cce9e`  
Branch: `feature/dark-mode-system-default-manual-toggle`

Changed:
- `src/app/globals.css`
- `src/app/(auth)/sign-in/sign-in-form.tsx`
- `src/app/layout.tsx`
- `src/app/theme-toggle.tsx`
- `src/app/theme-toggle.test.tsx`
- `tests/e2e/theme.spec.ts`

Verification passed:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npx playwright test theme`
- Browser smoke on `http://localhost:3000/`: System/Light/Dark, reload persistence, computed theme variables.

Handoff written and left uncommitted:
- `.omp/handoff/implementation-summary.md`

Final git status: clean except untracked workflow artifacts:
- `.omp/handoff/`
- `.omp/worktree-flow/dark-mode-system-default-manual-toggle/`
