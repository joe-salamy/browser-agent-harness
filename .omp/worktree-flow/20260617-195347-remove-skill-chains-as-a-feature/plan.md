# Remove Skill Chains as a Feature

## Context
Remove skill-chains entirely because they add feature complexity without enough value beyond a meta-skill that instructs agents to spawn subagents and load skills. The end state keeps standalone skills and normal agent runs, but removes the chain-specific CLI, browser/API workflow, server runner/builder/types, examples, tests, bundled chain-builder skill, metadata, and README/docs references. The user explicitly requested updating all references such as README, so user-facing copy is part of the removal.

## Approach

1. **Remove CLI entrypoints and package wiring.**
   - Edit `package.json` and delete only the `skill-chain:create` and `skill-chain` script entries from `scripts`; keep `tsx` because `prisma.seed` still uses `tsx prisma/seed.ts`.
   - Delete `scripts/create-skill-chain.ts`, `scripts/run-skill-chain.ts`, `scripts/skill-chain-cli.ts`, and `scripts/skill-chain-cli.test.ts`. These files are solely the chain manifest/create/run CLI surface and shared helpers.
   - Do not add replacement CLI commands or aliases; git history is the only recovery path.

2. **Remove browser skill-chain workflow and navigation.**
   - Delete the whole `src/app/workspaces/[workspaceId]/automation/` route subtree: `page.tsx`, `automation-client.tsx`, `manifest-builder-form.tsx`, `skill-chain-run-form.tsx`, `skill-chain-result-panel.tsx`, `skills-browser.tsx`, `types.ts`, and the three component tests in that directory.
   - Edit `src/app/workspaces/[workspaceId]/page.tsx` to remove the nav link whose href is `/workspaces/${workspaceId}/automation` and text is `Automation`; leave `Model settings`, `MCP settings`, workspace export, and audit export links unchanged.
   - Delete `tests/e2e/automation.spec.ts` and add `tests/e2e/workspace-navigation.spec.ts` as the replacement e2e coverage. The new test must sign in with the existing demo user, open `Demo Workspace`, store the workspace URL, assert `page.getByRole("link", { name: "Automation" })` has count 0, then navigate directly to `${workspaceUrl}/automation` and assert the response status is 404. Do not keep manifest creation/run/resume browser assertions.

3. **Remove public skill-chain API routes.**
   - Delete `src/app/api/workspaces/[workspaceId]/skill-chain-manifests/route.ts` and `route.test.ts`; this removes `POST /api/workspaces/[workspaceId]/skill-chain-manifests` and all calls to `buildSkillChainManifest`.
   - Delete `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts` and `route.test.ts`; this removes `POST /api/workspaces/[workspaceId]/skill-chains`, dry-run mode, resume mode, inline/file/path manifest parsing, and all calls to `runSkillChain`.
   - Do not leave 410 handlers for these routes. A missing App Router segment should produce the normal 404 for direct navigation/API access.

4. **Remove server skill-chain implementation.**
   - Delete `src/server/skill-chains/types.ts`, `builder.ts`, `runner.ts`, and all tests in `src/server/skill-chains/`: `types.test.ts`, `builder.test.ts`, `builder-run.test.ts`, `runner.test.ts`, and `runner.integration.test.ts`.
   - This intentionally removes `SkillChainManifest`, `parseSkillChainManifest`, `renderSkillChainOutputPath`, `SkillChainState`, `buildSkillChainManifest`, `runSkillChain`, chain audit events such as `skill.chain.manifest.created`, and the `server.chain-builder` constant. No compatibility re-exports or aliases.

5. **Remove chain-only workspace query data.**
   - Edit `src/server/workspaces/queries.ts` to delete `WorkspaceAutomationFile`, `WorkspaceAutomationData`, and `getWorkspaceAutomationData` because LSP found the only caller in the deleted automation page.
   - Keep `getWorkspaceOverview` unchanged except for type fallout from `SkillSummary` losing `chainRunnable`; it still feeds generic standalone skill selection to `RunForm`.

6. **Clean generic skill metadata while preserving standalone skills.**
   - Edit `src/server/skills/directory.ts`:
     - Remove `chainRunnable: boolean` from `SkillSummary`.
     - Remove `chainRunnable: boolean` from `ParsedSkillDocument`.
     - Delete the `frontmatter.chainRunnable` parse/validation block and the error string `Invalid skill chainRunnable.`
     - Remove `chainRunnable` assignments from `parseSkillDocument`, `summaryFromParsed`, `listWorkspaceSkillSummaries`, and `listServerSkillSummaries`.
     - Keep `name`, `description`, `entrypoint`, instructions, references, scripts, `requiredPermissions`, `hasEntrypoint`, and skill ID validation exactly as standalone skill support.
   - Because `parseDocument(...).toJSON()` already ignores unused frontmatter keys, do not add a special reject path for old user-authored `chainRunnable` fields; they become inert unknown metadata. Remove the field from repo docs and bundled samples so repo-owned references go to zero.
   - Update generic fixtures/assertions that currently include `chainRunnable`: `src/server/skills/directory.test.ts`, `src/server/skills/registry.test.ts`, `src/app/workspaces/[workspaceId]/run-form.test.tsx`, `src/app/api/workspaces/[workspaceId]/skills/route.test.ts`, and any `src/server/workspaces/queries.test.ts` fixture if typecheck exposes one.
   - Keep `src/app/api/workspaces/[workspaceId]/skills/route.ts`, `src/app/workspaces/[workspaceId]/run-form.tsx`, `src/server/skills/registry.ts`, and `src/server/skills/script-runner.ts`; they are standalone skill execution, not skill chains.

7. **Remove sample chain assets and adjust remaining bundled skills.**
   - Delete the `skill-chains/` directory, including `skill-chains/examples/research-plan-implementation.json`.
   - Delete `skills/chain-builder/` because its `SKILL.md` explicitly creates `SkillChainManifest` JSON and references chain-runnable steps/output paths.
   - Keep `skills/research-synthesis/` and `skills/web-search-grounding/` as generic standalone skills, but remove the `chainRunnable: true` frontmatter line from each `SKILL.md`.

8. **Update README and docs references.**
   - Edit `README.md` Skills frontmatter example to remove `chainRunnable: true` and change the following explanatory paragraph to say only: `name` must match the directory name; `description` is required; `entrypoint` is optional and must point inside `scripts/` to a `.js`, `.sh`, or `.py` file. Keep the existing entrypoint script-gating paragraph.
   - Delete the whole `## Skill chains` section, including manifest shape/rules and `npm run skill-chain:create` text.
   - Delete the `### Browser Automation GUI` subsection because it described only chain workflows.
   - Delete the two npm script table rows for `npm run skill-chain:create` and `npm run skill-chain`.
   - Delete the whole `## Skill-chain CLI options` section through the resume options table.
   - Leave `docs/product-brief.md` and `docs/market-research.md` generic skills/workflow content unchanged; read-only scouting found no skill-chain-specific text there. Do not read or edit `docs/scratchpad.md`.

9. **Final reference cleanup.**
   - After the edits above, remove any leftover imports, types, mocks, or tests surfaced by typecheck/lint that reference deleted skill-chain modules. The expected fix is deletion or generic skill DTO cleanup, not stubs.
   - `src/server/workspaces/files.integration.test.ts` contains a generic path-normalization fixture string `./chains//manifest.json`; keep or rename it only if desired by the implementer. It is not a skill-chain feature reference because it tests arbitrary workspace path normalization.

## Critical files & anchors
- `src/server/skills/directory.ts` — `SkillSummary`, `ParsedSkillDocument`, `parseSkillDocument`, and summary builders define the now-dead `chainRunnable` metadata while preserving standalone skill loading.
- `src/app/workspaces/[workspaceId]/page.tsx` — workspace nav exposes the chain-only `Automation` route; remove that link.
- `src/server/workspaces/queries.ts` — `WorkspaceAutomationData` and `getWorkspaceAutomationData` become dead after deleting the automation route.
- `README.md` — largest user-facing reference block: Skills metadata, Skill chains, Browser Automation GUI, script table rows, and Skill-chain CLI options.
- `package.json` — removes the only npm commands for chain creation/runs; keep all other scripts and dependencies unchanged unless verification proves dead imports.

## Verification
- Run targeted tests for retained generic behavior after updating fixtures:
  - `npm run test -- "src/server/skills/directory.test.ts" "src/server/skills/registry.test.ts" "src/app/api/workspaces/[workspaceId]/skills/route.test.ts" "src/app/workspaces/[workspaceId]/run-form.test.tsx" "src/server/workspaces/queries.test.ts"`
  - Expected: standalone skill discovery, skills API, workspace overview query, and Run form still pass without `chainRunnable` fields.
- Run the browser removal check:
  - `npm run test:e2e -- "tests/e2e/workspace-navigation.spec.ts"`
  - Expected observable behavior: signed-in Demo Workspace has no `Automation` link; direct `/workspaces/<workspaceId>/automation` returns 404.
- Run broad static checks because this is a clean deletion across exported TypeScript symbols:
  - `npm run typecheck`
  - `npm run lint`
- Run reference searches using the repo search tool or equivalent exact regex check after implementation:
  - Search `skill-chain|SkillChain|skillChain|chainRunnable|chain-runnable|server\.chain-builder` in `README.md`, `src`, `scripts`, `skills`, `tests`, and `package.json`. Expected: zero matches.
  - Search `/automation|Automation` in `src`, `README.md`, `scripts`, and `skills`. Expected: zero matches.
  - Search `/automation|Automation` in `tests`. Expected: matches only in `tests/e2e/workspace-navigation.spec.ts`, where they assert the removed route/link behavior.
  - Separately search `@/server/skill-chains|src/server/skill-chains|skill-chains/` across the repo. Expected: zero matches.
- Do not require `npm run test` or full MVP e2e unless targeted checks reveal unrelated coupling; the changed behavior is covered by the targeted Vitest files, typecheck/lint, and the route-removal Playwright check.

## Assumptions & contingencies
- Standalone skills remain a core feature. If execution reveals code where removing `chainRunnable` would also remove generic skill execution, keep the generic execution path and remove only the chain-specific field/string/import.
- `research-synthesis` and `web-search-grounding` stay because their instructions are generic standalone skills; only `chain-builder` is deleted as chain-only. If another bundled skill is found to mention `SkillChainManifest`, `skill-chain`, `chain-runnable`, or `chains/<manifest-id>`, delete that skill if it has no generic instructions; otherwise remove only the chain-specific lines.
- Old workspace-authored `SKILL.md` files may still contain `chainRunnable` frontmatter. The parser should ignore it as unknown metadata; do not add migration, warnings, or compatibility UI.
