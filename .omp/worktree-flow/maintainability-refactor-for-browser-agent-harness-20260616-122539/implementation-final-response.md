Implemented and committed the approved plan.

Commit:
- `7b59e4a59d5716b6b9ce211a5f178c990f276dd6` — `Implement plan`

Handoff:
- Wrote `.omp/handoff/implementation-summary.md`
- Left `.omp/handoff/` and `.omp/worktree-flow/.../` uncommitted as required.

Verification passed:
- `npm run prisma:generate`
- `npm run typecheck`
- `npm run lint`
- Focused Vitest groups from the plan
- `npm run test` — 26 passed, 2 skipped; 146 passed, 6 skipped
- `npm run build` — passed with one Turbopack NFT trace warning from `next.config.ts` / skill registry route tracing

Skipped:
- DB integration checks: `DATABASE_URL` unset
- E2E/manual seeded UI smoke: `OPENROUTER_API_KEY` and `DATABASE_URL` unset

Final status:
- No staged or unstaged tracked changes.
- Only workflow artifacts remain untracked.
