Implemented and committed the approved plan.

Commit:
- `340ba81d9526314583695ede755db8785baf7cc3` — `Implement plan`

Handoff:
- Wrote `.omp/handoff/implementation-summary.md`
- Left `.omp/handoff/` and `.omp/worktree-flow/` uncommitted as required.

Verification:
- Passed targeted Vitest: 5 files, 29 tests.
- Passed `npm run typecheck`.
- Passed `npm run lint`.
- Attempted `npm run test:e2e -- tests/e2e/automation.spec.ts`; failed before Automation because seeded sign-in did not reach `Workspaces`. No `.env.local` exists in this worktree, so the required local seeded auth/database environment was unavailable.

Final status:
- No staged or unstaged tracked changes.
- Only workflow artifacts remain untracked.
