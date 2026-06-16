# Multi-Skill Agent Runs Audit Summary

## Worktree
- Path: `C:\Users\joesa\Code\browser-agent-harness-multi-skill-agent-runs`
- Branch: `feature/multi-skill-agent-runs`
- Base used for diff: `master` at merge-base `edf18406836f4fb4960e75e4300701c4269bbb38`
- Implementation commit audited: `60d7f1a3db21278a09337b76037c553e64515e57`
- Audit fix commit: `4e2dfd6`

## Summary received
The implementation migrated hard-coded `core.*` skills into repo-local server directory skills, removed the core namespace and Tavily-specific web-search helper, added `runAgentWithSkills` for zero-or-more selected skills, moved browser-agent runs to repeated `skillIds` on `/agent-runs`, kept skill-chain steps singular while using `server.*` IDs, and updated focused tests/docs/examples.

## Skills loaded
- `audit-worktree`: required workflow for auditing this implementation worktree against the base branch.
- `typescript-strict-maintainer`: exported TypeScript API and strict form-boundary changes.
- `nextjs-app-router-reviewer`: `src/app/api/**/route.ts` and App Router route behavior.
- `react-ui-accessibility-reviewer`: `RunForm` multi-skill checkbox form and user-facing errors.
- `agent-mcp-safety-reviewer`: agent-run prompt/context construction, skill loading, audit logging, and injection boundaries.
- `vitest-playwright-quality-engineer`: focused route, registry, UI, and skill-chain tests.

## Audit findings and fixes
1. Confirmed route parser gap in `src/app/api/workspaces/[workspaceId]/agent-runs/route.ts`:
   - Missing `prompt` returned generic `{ error: "Run failed." }` instead of the required-prompt response.
   - Singular scalar fields (`model`, `outputPath`, `allowScripts`) validated only `formData.get(field)`, so requests with an initial string plus a later `File` under the same field were accepted.
   - Fix: added a shared first-string parser that scans all values for a scalar field, rejects any `File`, preserves first-string semantics, and treats missing `prompt` as blank.
2. Added regression coverage in `src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts`:
   - Missing prompt returns status 400 with `{ error: "Prompt is required." }`.
   - File-valued `model`, `outputPath`, and `allowScripts` fields reject before dispatch even when the first value is a string.

## Files changed by audit
- `src/app/api/workspaces/[workspaceId]/agent-runs/route.ts`
- `src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts`

## Verification
- `npm run test -- src/server/skills/registry.test.ts src/server/skills/directory.test.ts src/server/agents/minimal-runtime.test.ts`
  - Passed: 3 files, 19 tests.
- `npm run test -- "src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts" "src/app/api/workspaces/[workspaceId]/skills/route.test.ts" "src/app/workspaces/[workspaceId]/run-form.test.tsx"`
  - Passed: 3 files, 10 tests.
- `npm run test -- src/server/skill-chains/types.test.ts src/server/skill-chains/builder.test.ts src/server/skill-chains/builder-run.test.ts src/server/skill-chains/runner.test.ts src/server/skill-chains/runner.integration.test.ts "src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts"`
  - Passed: 5 files and 25 tests; 1 file and 3 tests skipped by existing environment gates.
- `npx tsc --noEmit`
  - Passed.
- `npm run lint`
  - Passed.

## Skipped checks
- Manual UI smoke test was not run; no development server/provider credential setup was used in this audit pass.
- Full Playwright E2E was not run; the plan explicitly kept `tests/e2e/mvp.spec.ts` unchanged and focused route/UI coverage covers the changed form POST behavior.

## Residual risks
- External clients using the deleted `/skills/[skillId]` POST route must migrate to `/agent-runs` with repeated `skillIds`; this remains the intentional clean cutover from the approved plan.
- `server.web-search-grounding` remains instruction-only and does not perform external web search; this remains intentional per plan.
