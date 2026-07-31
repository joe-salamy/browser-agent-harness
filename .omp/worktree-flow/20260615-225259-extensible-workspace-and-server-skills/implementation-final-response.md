Implemented and committed.

- Commit: `5409507bad3a2b6e5020a85d298195b53a042bb7`
- Handoff: `.omp/handoff/implementation-summary.md`
- Workflow artifacts left untracked: `.omp/handoff/`, `.omp/worktree-flow/extensible-workspace-and-server-skills/`

Verification:
- `npm install` passed
- `npm run prisma:generate` passed
- `npx tsc --noEmit` passed
- Focused Vitest target passed: 49 passed, 3 skipped
- `npm run lint` passed
- `npm run test` passed: 114 passed, 6 skipped
- `npm run build` passed with one non-fatal Turbopack NFT trace warning for `script-runner.ts`

Skipped:
- Manual browser/API smoke test not run; it needs a live signed-in workspace plus model credential/API key.
