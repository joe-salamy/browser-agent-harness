# Audit Summary

## Worktree

- Path: `C:/Users/joesa/Code/browser-agent-harness-extensible-workspace-and-server-skills`
- Branch: `feature/extensible-workspace-and-server-skills`
- Base ref used for diff: `master`
- Merge base: `cbf011a95f6506feb7fe32ca038afb4b9df3faea`

## Prior implementation summary received

The implementation added directory-based workspace/server skills, source-prefixed skill IDs, opt-in audited entrypoint execution, dynamic skill-chain validation/building, API/UI/CLI support, docs/env updates, and focused Vitest coverage. The prior run reported passing install, Prisma generation, typecheck, focused tests, lint, full tests, and build, with a skipped manual browser/API smoke test and a non-fatal Turbopack NFT trace warning.

## Skills loaded

- `audit-worktree`: required audit workflow.
- `auth-workspace-access-auditor`: route/authz boundaries for workspace skills and chains.
- `nextjs-app-router-reviewer`: App Router route handlers and client/server data flow.
- `workspace-file-storage-reviewer`: workspace file text reads and path/storage safety.
- `secret-credential-security-reviewer`: script environment stripping and secret exposure risks.
- `typescript-strict-maintainer`: exported TypeScript types, nullability, and parser boundaries.
- `vitest-playwright-quality-engineer`: missing regression coverage and verification selection.
- `agent-mcp-safety-reviewer`: model prompt/context safety and script execution boundaries.

## Issues found and fixes applied

1. Server directory skill path checks were lexical only.
   - Fixed `src/server/skills/directory.ts` to require absolute env roots and validate server roots, skill dirs, `SKILL.md`, and assets via `fs.realpath` before reading.
   - Added tests for relative env root rejection and symlink escape rejection.

2. Script stdout/stderr caps were applied only after process exit.
   - Fixed `src/server/skills/script-runner.ts` to cap retained output in stream handlers and keep original byte counts separately for audit metadata.
   - Strengthened truncation tests to assert retained output stays bounded.

3. Entrypoint execution could run truncated script text.
   - Fixed `src/server/skills/registry.ts` to reject missing or truncated entrypoint assets before spawn/model calls.
   - Added registry tests for both failures.

4. `SKILL.md` materialization was synthesized instead of preserving loaded content.
   - Added `skillMarkdown` to loaded directory skills and materialized that text for entrypoint runs.

5. Directory loader caps did not bound server/workspace reads.
   - Added `ObjectStore.getObjectRange` with local and S3 implementations.
   - Added `readWorkspaceTextFileCapped` and changed directory loader workspace reads to use cap-plus-sentinel reads.
   - Changed server skill/asset reads to bounded reads.

6. CLI resume command dropped script opt-in.
   - Fixed `scripts/run-skill-chain.ts` so generated resume commands include `--allow-scripts` when the original run used it.

7. Default skill-chain executor allowScripts passthrough lacked coverage.
   - Added runner test coverage for the default `runSkill` executor path.

8. Chain Builder unavailable-skill repair lacked coverage.
   - Added `src/server/skill-chains/builder-run.test.ts` to prove an unavailable dynamic skill ID triggers repair before manifest persistence.

9. Boolean parser contracts were too permissive.
   - Fixed skill-run FormData `allowScripts` parsing to accept only exact allowlisted strings.
   - Fixed skill-chain JSON `allowScripts` parsing to reject `null` as a present non-boolean value.
   - Added route regression tests for both.

## Files changed by audit

- `scripts/run-skill-chain.ts`
- `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts`
- `src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/skills/[skillId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/skills/[skillId]/route.test.ts`
- `src/server/skill-chains/builder-run.test.ts`
- `src/server/skill-chains/runner.test.ts`
- `src/server/skills/directory.ts`
- `src/server/skills/directory.test.ts`
- `src/server/skills/registry.ts`
- `src/server/skills/registry.test.ts`
- `src/server/skills/script-runner.ts`
- `src/server/skills/script-runner.test.ts`
- `src/server/storage/object-store.ts`
- `src/server/storage/local-object-store.ts`
- `src/server/storage/s3-object-store.ts`
- `src/server/workspaces/files.ts`

## Commit

- Audit fixes committed: `a47b36e` (`Fix audit findings`)

## Verification run

- `npm run test -- src/server/skills src/server/skill-chains src/app/api/workspaces/[workspaceId]/skills src/app/api/workspaces/[workspaceId]/skill-chains src/server/storage/local-object-store.test.ts`
  - Passed: 12 files passed, 1 skipped; 66 tests passed, 3 skipped.
- `npx tsc --noEmit`
  - Passed.
- `npm run lint`
  - Passed.
- `npm run test`
  - Passed: 21 files passed, 2 skipped; 122 tests passed, 6 skipped.
- `npm run build`
  - Passed.
  - Warnings: Turbopack NFT trace warnings remain for `directory.ts`/`registry.ts` imports reaching route/page bundles.

## Skipped checks

- Manual browser/API smoke test was not run. It still requires a live dev server, signed-in workspace, uploaded skill files, script execution enabled, and a working model credential/API key.
- No dedicated script timeout regression was added because the current timeout constant is fixed at 30s and the existing runner tests execute real child processes. Timeout behavior remains covered by implementation logic, not by a fast unit test.

## Residual risks

- Directory skill script execution still has no OS/container sandbox. The deployed default should remain `SKILL_SCRIPTS_ENABLED=false` unless the deployment accepts that boundary.
- Workspace/server skill descriptions are interpolated into the Chain Builder system prompt. Post-parse allow-list validation blocks unauthorized skill IDs, but malicious descriptions can still degrade model output quality.
- Turbopack NFT trace warnings remain non-fatal but indicate the directory-skill filesystem module is reachable from route/page bundles.
