Implemented and committed.

Commit:
- `6a305ef8e90f68c44bacce1770a37c7b70d673f0`
- Branch: `feature/remove-skill-chains-as-a-feature`

Handoff:
- Wrote `.omp/handoff/implementation-summary.md`
- Left `.omp/**` artifacts untracked as required.

Verification:
- Passed: targeted Vitest, 5 files / 27 tests.
- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Passed: direct deleted-route probe: `/workspaces/nonexistent/automation` returned `404`.
- Passed required scoped reference searches: no remaining chain terms in committed source/docs/tests except the new e2e removal assertions.

Blocked check:
- `npm run test:e2e -- "tests/e2e/workspace-navigation.spec.ts"` could not complete login in this worktree because no `.env` / `.env.local` exists and env lacks `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`; demo login returned `Invalid email or password.`.
