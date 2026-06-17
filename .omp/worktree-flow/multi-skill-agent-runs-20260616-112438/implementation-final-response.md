Implemented and committed.

Commit:

- `60d7f1a3db21278a09337b76037c553e64515e57`
- Branch: `feature/multi-skill-agent-runs`

Delivered:

- Migrated built-in skills to `skills/<name>/SKILL.md`.
- Removed `core.*` dispatch and Tavily-specific skill code.
- Added `runAgentWithSkills` for zero/one/many ordered skills.
- Moved `/agent-runs` to strict FormData parsing with repeated `skillIds`.
- Deleted obsolete `/skills/[skillId]` POST route.
- Collapsed run UI to one optional multi-skill form.
- Updated skill-chain runner to keep one skill per step via `skillIds: [step.skillId]`.
- Updated tests, README, and examples.

Verification passed:

- `npm run test -- src/server/skills/registry.test.ts src/server/skills/directory.test.ts src/server/agents/minimal-runtime.test.ts`
- `npm run test -- src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts src/app/api/workspaces/[workspaceId]/skills/route.test.ts src/app/workspaces/[workspaceId]/run-form.test.tsx`
- `npm run test -- src/server/skill-chains/types.test.ts src/server/skill-chains/builder.test.ts src/server/skill-chains/builder-run.test.ts src/server/skill-chains/runner.test.ts src/server/skill-chains/runner.integration.test.ts src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`
- `npx tsc --noEmit`
- `npm run lint`

Handoff written:

- `.omp/handoff/implementation-summary.md`

Final status:

- Tracked files clean.
- Only workflow artifacts untracked: `.omp/handoff/`, `.omp/worktree-flow/multi-skill-agent-runs/`.
