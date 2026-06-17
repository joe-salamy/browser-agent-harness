# Multi-Skill Agent Runs Implementation Summary

## Plan

- Plan path: `.omp/worktree-flow/multi-skill-agent-runs/plan.md`

## Worktree and branch

- Worktree path: `C:\Users\joesa\Code\browser-agent-harness-multi-skill-agent-runs`
- Branch: `feature/multi-skill-agent-runs`
- Commit: `60d7f1a3db21278a09337b76037c553e64515e57`

## Changed files

- Added server directory skills:
  - `skills/research-synthesis/SKILL.md`
  - `skills/web-search-grounding/SKILL.md`
  - `skills/chain-builder/SKILL.md`
- Updated runtime and skill registry:
  - `src/server/skills/registry.ts`
  - `src/server/skills/directory.ts`
  - `src/server/skills/registry.test.ts`
  - `src/server/skills/directory.test.ts`
- Deleted obsolete hard-coded Tavily skill implementation:
  - `src/server/skills/web-search.ts`
  - `src/server/skills/web-search.test.ts`
- Updated agent-run route and workspace UI:
  - `src/app/api/workspaces/[workspaceId]/agent-runs/route.ts`
  - `src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts`
  - `src/app/workspaces/[workspaceId]/run-form.tsx`
  - `src/app/workspaces/[workspaceId]/run-form.test.tsx`
  - `src/app/api/workspaces/[workspaceId]/skills/route.test.ts`
  - Deleted `src/app/api/workspaces/[workspaceId]/skills/[skillId]/route.ts`
  - Deleted `src/app/api/workspaces/[workspaceId]/skills/[skillId]/route.test.ts`
- Updated skill-chain IDs and execution path:
  - `src/server/skill-chains/types.ts`
  - `src/server/skill-chains/types.test.ts`
  - `src/server/skill-chains/builder.ts`
  - `src/server/skill-chains/builder.test.ts`
  - `src/server/skill-chains/runner.ts`
  - `src/server/skill-chains/runner.test.ts`
  - `src/server/skill-chains/runner.integration.test.ts`
  - `src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`
  - `scripts/create-skill-chain.ts`
  - `skill-chains/examples/research-plan-implementation.json`
- Updated docs:
  - `README.md`

## Behavior changes

- Legacy `core.*` skill IDs are removed from normal validation and listing. Valid skill IDs are now only `workspace.*` and `server.*`.
- Built-in harness skills now live as ordinary repo-local server directory skills under `skills/<name>/SKILL.md` and are discovered as:
  - `server.research-synthesis`
  - `server.web-search-grounding`
  - `server.chain-builder`
- `listAvailableSkills` now returns directory-discovered skills only.
- Added `runAgentWithSkills`, which supports no skills, one skill, or multiple ordered selected skills.
- No-skill agent runs call the minimal runtime directly without skill validation, workspace editor access checks, or `skill.loaded` audit logs.
- Skill-backed runs validate all selected IDs, reject duplicates, assert editor access once, load directory skills in order, audit each loaded skill with `eventType: "skill.loaded"`, build ordered supplemental contexts, run enabled entrypoints, and call the minimal runtime once.
- Skill instruction context is labeled per skill ID. References, scripts, and script output are also labeled per selected skill ID.
- `POST /api/workspaces/[workspaceId]/agent-runs` now accepts repeated `skillIds` fields in `FormData`, strict string-only fields, optional `outputPath`, and the previous exact `allowScripts` token set.
- Deleted the single-skill POST route under `/skills/[skillId]`; callers use `/agent-runs` with `skillIds` instead.
- Workspace run form is now one form. Users may submit with zero, one, or many checked skills. The submit button remains enabled even when no skills are available.
- Skill-chain steps remain singular (`skillId` per step), but the runner executes each step through `runAgentWithSkills({ skillIds: [step.skillId] })`.
- `scripts/create-skill-chain.ts` now calls `buildSkillChainManifest` directly instead of routing through a special `core.chain-builder` skill.
- Tavily-specific web search code and `TAVILY_API_KEY` documentation were removed. `server.web-search-grounding` is an instruction-only directory skill.

## Tests and checks run

- `npm ci`
  - Installed dependencies from `package-lock.json` because `node_modules` was absent and `vitest` was not available.
- `npm run prisma:generate`
  - Generated Prisma Client after `npm ci`; required before tests importing `@prisma/client` could run.
- `npm run test -- src/server/skills/registry.test.ts src/server/skills/directory.test.ts src/server/agents/minimal-runtime.test.ts`
  - Passed: 3 files, 19 tests.
- `npm run test -- src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts src/app/api/workspaces/[workspaceId]/skills/route.test.ts src/app/workspaces/[workspaceId]/run-form.test.tsx`
  - Passed: 3 files, 8 tests.
- `npm run test -- src/server/skill-chains/types.test.ts src/server/skill-chains/builder.test.ts src/server/skill-chains/builder-run.test.ts src/server/skill-chains/runner.test.ts src/server/skill-chains/runner.integration.test.ts src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`
  - Passed: 5 files, 25 tests. 1 file and 3 tests skipped by existing environment gates.
- `npx tsc --noEmit`
  - Passed.
- `npm run lint`
  - Passed.

## Skipped checks

- Manual UI smoke test was not run. No provider credentials or running development server were configured in this task context.
- Full Playwright E2E was not run. The approved plan explicitly said not to update `tests/e2e/mvp.spec.ts`; focused route/UI/component coverage was run instead.

## Implementation decisions and tradeoffs

- Used a static `runSkillEntrypoint` import in `src/server/skills/registry.ts` to comply with the project rule against literal dynamic imports. Behavior remains gated by `allowScripts` and `SKILL_SCRIPTS_ENABLED` before entrypoint execution.
- Duplicate selected skill IDs are rejected before any skill loading. This is stricter than merely rejecting before loading the duplicate and avoids partial side effects.
- `core.research-synthesis` remains only in `src/server/skills/registry.test.ts` as an intentional rejection assertion.
- Directory tests now assert containment because the repo-root `skills/` directory is intentionally discovered during tests.

## Assumptions, blockers, residual risks, follow-up

- Assumption: The workflow expects the implementation commit only; `.omp/handoff/` and `.omp/worktree-flow/` remain untracked and were not committed.
- Residual risk: Existing external clients posting to the deleted `/skills/[skillId]` route must migrate to `/agent-runs` with repeated `skillIds`; this is intentional clean cutover per plan.
- Residual risk: `server.web-search-grounding` no longer performs external web search. This is intentional per plan; future external search should be added through a generic tool/entrypoint model, not a hard-coded skill branch.
