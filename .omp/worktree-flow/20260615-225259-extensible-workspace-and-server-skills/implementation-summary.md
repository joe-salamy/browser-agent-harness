# Implementation Summary

## Plan

- Plan path: `.omp/worktree-flow/extensible-workspace-and-server-skills/plan.md`
- Worktree path: `C:/Users/joesa/Code/browser-agent-harness-extensible-workspace-and-server-skills`
- Branch: `feature/extensible-workspace-and-server-skills`
- Commit: `5409507bad3a2b6e5020a85d298195b53a042bb7`

## Changed Files

- `.env.example`
- `README.md`
- `package.json`
- `package-lock.json`
- `scripts/run-skill-chain.ts`
- `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts`
- `src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/skills/[skillId]/route.ts`
- `src/app/api/workspaces/[workspaceId]/skills/[skillId]/route.test.ts`
- `src/app/api/workspaces/[workspaceId]/skills/route.ts`
- `src/app/api/workspaces/[workspaceId]/skills/route.test.ts`
- `src/app/workspaces/[workspaceId]/page.tsx`
- `src/app/workspaces/[workspaceId]/run-form.tsx`
- `src/server/skill-chains/builder.ts`
- `src/server/skill-chains/builder.test.ts`
- `src/server/skill-chains/runner.ts`
- `src/server/skill-chains/runner.test.ts`
- `src/server/skill-chains/types.ts`
- `src/server/skill-chains/types.test.ts`
- `src/server/skills/directory.ts`
- `src/server/skills/directory.test.ts`
- `src/server/skills/registry.ts`
- `src/server/skills/registry.test.ts`
- `src/server/skills/script-runner.ts`
- `src/server/skills/script-runner.test.ts`
- `src/server/workspaces/files.ts`

## Behavior Changes

- Added directory skill discovery/loading for workspace skills under `skills/<name>/SKILL.md` and server skills under `skills/`, `.agents/skills/`, and `BROWSER_AGENT_SKILL_ROOTS` roots.
- Added source-prefixed dynamic skill IDs: `workspace.<name>` and `server.<name>`. Core skills remain `core.research-synthesis`, `core.web-search-grounding`, and `core.chain-builder`.
- Added YAML frontmatter parsing via the new `yaml` dependency. Required fields are `name` and `description`; `chainRunnable` defaults to true; `entrypoint` must stay under `scripts/` and end in `.js`, `.sh`, or `.py`.
- Added directory skill content caps and truncation markers through `MAX_SKILL_INSTRUCTIONS_CHARS`, `MAX_SKILL_REFERENCE_TOTAL_CHARS`, and `MAX_SKILL_ASSET_CHARS`.
- Added audited entrypoint execution through `runSkillEntrypoint`. It materializes skill files into a temp dir, writes stdin JSON, strips env to `PATH` and `PYTHONIOENCODING`, enforces timeout and output caps, audits start/finish, and removes the temp dir in `finally`.
- Added double opt-in script gating: `allowScripts === true` and `SKILL_SCRIPTS_ENABLED === "true"`. Entrypoint skills fail before model calls when either gate is absent.
- Replaced hardcoded registry exports with `CORE_SKILLS`, `listAvailableSkills`, `UnknownSkillError`, and a dynamic `runSkill` resolver.
- Directory skills run through `minimalAgentRuntime.run` with the exact skill prompt shape from the plan and supplemental contexts for references, scripts, and successful script output.
- Skill-chain manifests now validate skill ID syntax only at schema parse time. Runtime/builder validation rejects unknown or non-chain-runnable skills with `Skill chain step <step.id> references unavailable skill <step.skillId>.`.
- Chain Builder prompts now include exact current chain-runnable IDs/descriptions and repair unknown generated IDs before storing a manifest.
- Added `allowScripts` passthrough from skill-chain API and CLI to step execution.
- Added `GET /api/workspaces/[workspaceId]/skills` for viewer-authorized skill listing.
- Updated `POST /api/workspaces/[workspaceId]/skills/[skillId]` to delegate unknown/access handling to registry and parse `allowScripts` FormData.
- Updated workspace Run UI to use a dynamic skill selector with prompt, model, outputPath, and allowScripts fields.
- Extended workspace readable text detection to include `.js`, `.sh`, `.py`, and common script content types so directory skill scripts can be workspace text assets.
- Documented skill layout, server roots, source-prefixed IDs, script gates, supported entrypoint extensions, and `--allow-scripts` run CLI option.

## Tests and Checks Run

- `npm install`
  - Result: passed; installed `yaml` and updated `package-lock.json`.
- `npm run prisma:generate`
  - Result: passed; Prisma client generated after dependency install.
- `npx tsc --noEmit`
  - Result: passed.
- `npm run test -- src/server/skills src/server/skill-chains src/app/api/workspaces/[workspaceId]/skills src/app/api/workspaces/[workspaceId]/skill-chains`
  - Result: passed; 10 files passed, 1 skipped; 49 tests passed, 3 skipped.
- `npm run lint`
  - Result: passed.
- `npm run test`
  - Result: passed; 20 files passed, 2 skipped; 114 tests passed, 6 skipped.
- `npm run build`
  - Result: passed; emitted one non-fatal Turbopack NFT warning that `src/server/skills/script-runner.ts` is traced into the skills route through `registry.ts`.

## Skipped Checks

- Manual browser/API smoke test from the plan was not run. It requires a live dev server, signed-in workspace, uploaded skill files, `SKILL_SCRIPTS_ENABLED=true`, and a working model credential or `OPENROUTER_API_KEY`. Automated tests cover the route parsing, dynamic listing, registry dispatch, script execution, and chain validation paths.

## Implementation Decisions and Tradeoffs

- `CORE_SKILLS` entries include `SkillSummary` fields directly so `listAvailableSkills` can return a single DTO shape without compatibility aliases.
- `core.chain-builder` remains runnable via `runSkill` but has `chainRunnable: false`, so chain manifests and Chain Builder output cannot use it as an executable step.
- The registry remains the single import path for both listing and execution. This causes the final build's non-fatal Turbopack NFT trace warning because `script-runner` is reachable from the registry execution path.
- Script runner errors returned to callers include entrypoint path and exit/timeout status only; stdout/stderr content is not included in thrown errors or audit metadata.
- Workspace skill assets reuse the existing workspace file store and text-file reader. No Prisma `SkillDefinition` model changes were made.
- `.sh` and `.py` command selection follows the plan exactly with `process.env.BASH_BIN ?? "bash"` and `process.env.PYTHON_BIN ?? "python"`.

## Assumptions, Risks, and Follow-up

- There is no OS/container sandboxing for scripts. The implemented boundary is temp-dir materialization, stripped environment, timeout, output caps, and audit logs. Keep `SKILL_SCRIPTS_ENABLED=false` unless deployment accepts that risk.
- Build warning: Turbopack reports an NFT trace warning for `script-runner.ts` via the registry. Build still succeeds. A deeper split between listing and execution modules may remove the trace but would change the one-import registry boundary requested by the plan.
- Server skill discovery currently rejects/list-load failures by surfacing parser/validation errors for invalid skill directories. This is strict and test-covered for invalid entrypoints/name mismatches.
- Workflow artifacts under `.omp/handoff/` and `.omp/worktree-flow/` remain untracked and were not committed.
