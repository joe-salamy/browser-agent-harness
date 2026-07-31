# Expose CLI Functionality in the Browser GUI

## Context
The repo already has a browser GUI for workspaces, files, single agent runs, model settings, MCP registry settings, audit logs, and exports, but the skill-chain CLI is not fully available through the GUI. `npm run skill-chain:create` is CLI-only, `npm run skill-chain` has a browser API but no browser page, and CLI dry-run behavior is not exposed in any browser route. The intended end state is a workspace-level Automation GUI that exposes every current skill-chain CLI flag/flow, plus a repo-local `.omp` UI/UX skill and an `AGENTS.md` rule that keeps future CLI features GUI-aligned.

## Approach

### 1. Add the repo-local UI/UX skill under `.omp/skills`
Independent of the GUI/API changes.

- Create `.omp/skills/browser-gui-ux-designer/SKILL.md` using the same `.omp` skill shape as `.omp/skills/react-ui-accessibility-reviewer/SKILL.md`: YAML frontmatter with `name`, `description`, `license: MIT`, and nested `metadata`, followed by Markdown sections.
- Use this exact frontmatter:

  ```yaml
  ---
  name: browser-gui-ux-designer
  description: Designs and reviews browser GUI workflows for this repo so CLI/API capabilities become understandable, accessible workspace UI. Use for workspace automation, skill-chain UX, multi-step forms, status/result panels, and CLI-to-GUI parity.
  license: MIT
  metadata:
    author: repo-local
    version: "1.0.0"
    domain: frontend-ux
    triggers: ux, gui, browser, automation, workflow, wizard, progressive disclosure, form validation, cli parity
    role: specialist
    scope: design-review
    output-format: ux-findings-and-wireflow
  ---
  ```

- Body content must include these sections and decisions:
  - `# Browser GUI UX Designer`
  - `## Use When`: browser workflow design, CLI-to-GUI parity, automation/skill-chain forms, multi-step status/result UI, and user-facing error recovery.
  - `## Repo Context`: App Router UI under `src/app`, Server Components by default, client islands for interactive forms, existing global classes in `src/app/globals.css` (`container`, `page`, `card`, `grid`, `btn`, `input`, `table`, `badge`, `muted`, `error-text`), tests via Vitest/Testing Library and Playwright.
  - `## Workflow`: map CLI/API capability to GUI task; group by user intent; use progressive disclosure for advanced options; keep status visible during long operations; validate near fields after user action; design empty/loading/success/failure/resume states; verify keyboard and screen-reader path.
  - `## Required Checks`: every CLI flag has a visible GUI control or a browser-equivalent import/selector; primary path is obvious; advanced sources such as raw JSON/file id are behind radio/fieldset controls; long-running actions show pending and final status; errors tell the user what to fix; result panels link to created workspace artifacts.
  - `## Sources`: include these exact URLs and short notes:
    - `https://www.nngroup.com/articles/progressive-disclosure/` — advanced or rarely used features should be deferred to secondary UI so complex apps are easier to learn and less error-prone.
    - `https://www.nngroup.com/articles/visibility-system-status/` — users need timely feedback about what the system is doing and whether actions worked.
    - `https://www.nngroup.com/articles/errors-forms-design-guidelines/` — form errors should identify the problem and help users correct fields.
    - `https://m3.material.io/components/text-fields/guidelines` — text fields are the standard component for form/dialog text entry; use clear labels/supporting/error text.
    - `https://www.w3.org/WAI/ARIA/apg/` — prefer semantic HTML; use ARIA patterns only when native elements are insufficient.

### 2. Add a persistent CLI/GUI parity rule to `AGENTS.md`
Independent of the GUI/API changes.

- Append this exact bullet to the existing root `AGENTS.md` list:

  ```md
  - Keep CLI and browser GUI in parity: when adding or changing any user-facing CLI command or flag, expose the same workflow in the browser GUI in the same change, or document why that CLI behavior is not browser-applicable; update tests for both surfaces.
  ```

- Do not edit `docs/scratchpad.md`.

### 3. Add browser API parity for `npm run skill-chain:create`
Depends on existing `buildSkillChainManifest` in `src/server/skill-chains/builder.ts` and request helpers in `src/server/request-parsing.ts`.

- Create `src/app/api/workspaces/[workspaceId]/skill-chain-manifests/route.ts` with `POST` only.
- Route behavior:
  1. `const userId = await requireUserId();`
  2. Read `workspaceId` from `context.params`.
  3. Call `assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR)` before parsing the request body, matching `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts` access-before-body-parse behavior.
  4. Parse JSON with `parseJsonObject(await request.json())`.
  5. Parse fields with existing helpers:
     - `prompt`: required string, trimmed. Use `optionalJsonString(body, "prompt")`; if missing/blank, return `NextResponse.json({ error: "Goal is required." }, { status: 400 })`.
     - `model`: `optionalJsonString(body, "model")`.
     - `outputPath`: `optionalJsonString(body, "outputPath")`.
     - `dryRun`: `optionalJsonBoolean(body, "dryRun") ?? false`; if present and not boolean, let `workspaceRouteErrorResponse(error, "Skill chain manifest creation failed.", 400)` handle it.
  6. If `dryRun` is true, do not call `buildSkillChainManifest`; return exactly `{ status: "DRY_RUN", workspaceId, goalCharacters: prompt.length }`.
  7. If `dryRun` is false, call:

     ```ts
     buildSkillChainManifest({
       userId,
       workspaceId,
       prompt,
       model,
       outputPath,
     })
     ```

     and return its result JSON unchanged.
  8. Catch errors with `workspaceRouteErrorResponse(error, "Skill chain manifest creation failed.", 400)`.

- Browser equivalents of create CLI flags:
  - `--goal`: textarea value sent as `prompt`.
  - `--goal-file`: browser file picker reads file text with `File.text()` client-side and writes the content into the same `prompt` textarea/API field. Never send local filesystem paths.
  - `--model`: optional text/select value sent as `model`.
  - `--output-path`: optional workspace path value sent as `outputPath`.
  - `--dry-run`: secondary “Preview manifest creation” button sends `dryRun: true` and shows the dry-run result without creating files or calling the model.
  - `--user-email`, `--workspace-id`, and `--workspace-name`: browser route/session equivalent is the authenticated user plus `/workspaces/[workspaceId]/automation`; do not recreate email/name lookup inside the workspace page.

- Create `src/app/api/workspaces/[workspaceId]/skill-chain-manifests/route.test.ts` by copying the mock style from `src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`.
- Required route tests:
  - Editor access is checked before `request.json()` is called when access fails.
  - Missing/blank `prompt` returns 400 `{ error: "Goal is required." }` and does not call `buildSkillChainManifest`.
  - Non-string optional fields or non-boolean `dryRun` return 400 fallback `{ error: "Skill chain manifest creation failed." }` and do not call `buildSkillChainManifest`.
  - `dryRun: true` returns `{ status: "DRY_RUN", workspaceId: "workspace-1", goalCharacters: <trimmed length> }` and does not call `buildSkillChainManifest`.
  - Real create trims fields and calls `buildSkillChainManifest` with `userId`, `workspaceId`, `prompt`, optional `model`, and optional `outputPath`, then returns `runId`, `status`, `outputFileId`, `outputPath`, `manifestPath`, and `manifest` from the mocked builder.

### 4. Extend the existing skill-chain API for dry-run and stricter manifest parsing
Depends on current route `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts` and `parseSkillChainManifest` from `src/server/skill-chains/types.ts`.

- Modify `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts` instead of creating a second run route.
- Keep existing access behavior: `requireUserId`, `workspaceId`, and `assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR)` happen before `request.json()`.
- Replace the current cast `manifest: body.manifest as SkillChainManifest | undefined` with explicit parsing:

  ```ts
  const manifest = "manifest" in body ? parseSkillChainManifest(body.manifest) : undefined;
  ```

- Parse `dryRun` with `optionalJsonBoolean(body, "dryRun") ?? false`.
- Keep existing optional trimmed fields: `manifestFileId`, `manifestPath`, `initialInput`, `model`, `resumeStatePath`, and `allowScripts`.
- Add an internal route helper `validateSkillChainModeForRoute(input)` in the same file. It must enforce the same mode rules as `scripts/run-skill-chain.ts`:
  - Count manifest sources: `manifest`, `manifestFileId`, `manifestPath`.
  - Count input sources: `initialInput` only, because browser `--input-file` imports into `initialInput`.
  - If `resumeStatePath` is present: reject any `initialInput`; reject more than one manifest source; allow zero or one manifest source.
  - If `resumeStatePath` is absent: require exactly one manifest source; require exactly one input source.
- If `dryRun` is true, call the helper and return exactly:

  ```ts
  {
    status: "DRY_RUN",
    workspaceId,
    mode: resumeStatePath ? "resume" : "new",
    manifestId: manifest?.id,
    scriptsEnabled: allowScripts === true,
  }
  ```

  Do not call `runSkillChain`; do not load workspace manifest paths/file IDs; this matches CLI dry-run behavior, which validates mode and parses local manifest JSON when supplied but does not execute the chain.
- If `dryRun` is false, call `validateSkillChainModeForRoute` before `runSkillChain`, then call:

  ```ts
  runSkillChain({
    userId,
    workspaceId,
    manifest,
    manifestFileId,
    manifestPath,
    initialInput,
    model,
    resumeStatePath,
    allowScripts,
  })
  ```

- Keep catch fallback `workspaceRouteErrorResponse(error, "Skill chain run failed.", 400)`.
- Update `src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts`:
  - Existing tests remain valid.
  - Add non-boolean `dryRun` rejection.
  - Add invalid `manifest` object rejection before `runSkillChain`.
  - Add dry-run new-run test with inline manifest and initial input; expect `mode: "new"`, `manifestId`, `scriptsEnabled`, and no `runSkillChain` call.
  - Add dry-run resume test with `resumeStatePath` and no initial input; expect `mode: "resume"` and no `runSkillChain` call.
  - Add mode-validation tests for new run missing manifest source, new run missing input, resume with initial input, and resume with two manifest sources; each returns 400 fallback and does not call `runSkillChain`.

### 5. Add a workspace-level Automation page and navigation
Depends on API steps 3 and 4 for full behavior; can be developed against mocked fetches in component tests first.

- Add a nav link in `src/app/workspaces/[workspaceId]/page.tsx` inside the existing header nav card, after MCP settings and before export links:

  ```tsx
  <Link href={`/workspaces/${workspaceId}/automation`}>Automation</Link>
  ```

- Add `src/app/workspaces/[workspaceId]/automation/page.tsx` as a Server Component.
- Page behavior:
  1. Call `getCurrentUserId`; redirect unauthenticated users to `/sign-in`.
  2. Read `workspaceId` from params.
  3. Load workspace automation data from a new query in `src/server/workspaces/queries.ts` named:

     ```ts
     export type WorkspaceAutomationData = {
       workspace: Workspace;
       files: Array<{
         id: string;
         path: string;
         contentType: string;
         sizeBytes: number;
         readableByCore: boolean;
       }>;
       skills: SkillSummary[];
       canEdit: boolean;
     };

     export async function getWorkspaceAutomationData(input: {
       userId: string;
       workspaceId: string;
     }): Promise<WorkspaceAutomationData>;
     ```

  4. Implement `getWorkspaceAutomationData` by copying the access/list pattern from `getWorkspaceOverview`: `requireWorkspaceMembership(..., WorkspaceRole.VIEWER)`, derive `canEdit` with `hasRoleAtLeast(role, WorkspaceRole.EDITOR)`, `Promise.all([listWorkspaceFiles, listAvailableSkills])`, and map files to the exact DTO above using `isCoreReadableText`.
  5. Render a page with existing CSS conventions: `<main className="container page">`, back link `← Workspace`, `<h1>Automation</h1>`, explanatory muted text, and cards/grids matching existing workspace pages.
  6. Pass only serializable DTOs to client components.

- Add these client components under `src/app/workspaces/[workspaceId]/automation/`:
  - `automation-client.tsx`: owns shared state for the latest builder result, latest chain result, active run mode (`"new" | "resume"`), and prefilled manifest path/state path. Renders the three forms/panels below.
  - `manifest-builder-form.tsx`: Create/preview manifest form.
  - `skill-chain-run-form.tsx`: New-run/resume/dry-run form.
  - `skill-chain-result-panel.tsx`: Shared result renderer for builder and runner outputs.
  - `skills-browser.tsx`: Available skills table.

- Use these exact client-side DTO/result types in `automation-client.tsx` or a sibling `types.ts`:

  ```ts
  export type AutomationFileOption = {
    id: string;
    path: string;
    contentType: string;
    sizeBytes: number;
    readableByCore: boolean;
  };

  export type AutomationSkillOption = SkillSummary;

  export type BuildManifestDryRunResult = {
    status: "DRY_RUN";
    workspaceId: string;
    goalCharacters: number;
  };

  export type BuildManifestResult = BuildManifestDryRunResult | (AgentRunResult & {
    outputPath?: string;
    manifestPath?: string;
    manifest?: SkillChainManifest;
  });

  export type SkillChainDryRunResult = {
    status: "DRY_RUN";
    workspaceId: string;
    mode: "new" | "resume";
    manifestId?: string;
    scriptsEnabled: boolean;
  };

  export type SkillChainUiResult = SkillChainDryRunResult | SkillChainRunResult;
  ```

  Import `SkillSummary`, `SkillChainManifest`, `SkillChainRunResult`, and `AgentRunResult` from existing server/type modules only as `import type` in client files.

### 6. Implement the Create Manifest GUI
Depends on the new `skill-chain-manifests` API.

- `manifest-builder-form.tsx` controls:
  - `Goal` textarea, required for real create and dry-run.
  - `Import goal file` file input. On change, call `await file.text()` and replace the goal textarea value. Show the imported filename in muted text. If reading fails, show `<p role="alert" className="error-text">Could not read goal file.</p>`.
  - `Model` optional input, default placeholder `openai/gpt-4.1-mini`; do not hard-code this as submitted value unless user types it.
  - `Manifest output path` optional input, placeholder `chains/manifests/my-chain.json`.
  - Primary button `Create manifest` sends `dryRun: false`.
  - Secondary button `Preview manifest creation` sends `dryRun: true`.
- POST JSON to `/api/workspaces/${workspaceId}/skill-chain-manifests`.
- Trim client strings before sending; omit empty optional fields.
- Pending state disables both buttons and changes their labels to `Creating...` or `Previewing...`.
- On API error, parse `{ error }` and show it in `role="alert"`.
- On success:
  - Show `Status` for both dry-run and real results.
  - For dry-run, show `Goal characters: N`.
  - For real success, show `Manifest path`, `Output file` link to `/workspaces/${workspaceId}?fileId=${outputFileId}`, and a `Use this manifest in run form` button when `manifestPath` exists.
  - The handoff button sets the run form to new-run mode, manifest source `workspacePath`, `manifestPath` equal to the created manifest path, and `initialInput` equal to the current goal text, matching the CLI-generated run command handoff.
  - Dispatch `workspace-updated` after real create success, not after dry-run.

### 7. Implement the Run/Resume Skill Chain GUI
Depends on the existing/extended `skill-chains` API.

- `skill-chain-run-form.tsx` must expose every `npm run skill-chain` flag as a browser equivalent:
  - `--manifest`: manifest source radio `Paste/import manifest JSON`. Provide a textarea and an `Import manifest JSON` file input. File input reads text client-side; parse JSON before sending. If JSON parse fails, show `Manifest JSON is invalid.` in `role="alert"` and do not submit.
  - `--manifest-workspace-path`: manifest source radio `Workspace manifest path`; text input sent as `manifestPath`.
  - `--manifest-file-id`: manifest source radio `Workspace manifest file`; select options from `files`, displaying `path` and using `id` as the value sent as `manifestFileId`.
  - `--input`: `Initial input` textarea sent as `initialInput` in new-run mode.
  - `--input-file`: `Import initial input file` file input that reads text client-side into the initial input textarea. Never send local paths.
  - `--resume-state-path`: resume mode field `State file path`, sent as `resumeStatePath`.
  - `--model`: optional model input sent as `model`.
  - `--allow-scripts`: checkbox sent as `allowScripts: true` when checked; omit or send false when unchecked.
  - `--dry-run`: secondary `Preview chain run` / `Preview resume` button sends `dryRun: true` and never executes the chain.
- Organize the form with two top-level tabs or radio cards:
  - `New run`: requires exactly one manifest source and initial input. Hide `resumeStatePath`.
  - `Resume`: requires `resumeStatePath`, hides/disables initial input, and allows zero or one optional manifest source for cross-check.
- For manifest source controls, use a `<fieldset>` and real radio inputs so keyboard users can switch sources.
- For path/file-id advanced controls, use progressive disclosure: only render the controls for the selected manifest source.
- Submit JSON to `/api/workspaces/${workspaceId}/skill-chains` with only fields relevant to the selected mode/source.
- Pending state disables submit buttons and uses labels `Running...`, `Resuming...`, or `Previewing...`.
- On success, pass the result to `skill-chain-result-panel.tsx`; dispatch `workspace-updated` only for real run/resume, not for dry-run.
- On failure, show the API `{ error }` in `role="alert"` and keep user-entered values intact.

### 8. Render chain status, artifacts, resume handoff, and skills clearly
Depends on the Run/Resume GUI.

- `skill-chain-result-panel.tsx` must support three result shapes:
  - Builder dry-run/result from `manifest-builder-form.tsx`.
  - Chain dry-run from `skill-chain-run-form.tsx`.
  - Real `SkillChainRunResult` from `runSkillChain`.
- Real chain result display:
  - Show `Run`, `Status`, `State`, `Manifest`, `Initial input`, and `Current step`.
  - Render a table with columns `Step`, `Skill`, `Status`, `Output`, and `Message` from `steps`.
  - For rows with `outputFileId`, render a link to `/workspaces/${workspaceId}?fileId=${outputFileId}` and label it with `outputPath`.
  - For `FAILED` or `WAITING_FOR_INPUT`, show `errorMessage` in `.error-text` and a `Resume this chain` button that sets the run form to resume mode with `resumeStatePath` equal to `statePath` and preserves current `allowScripts`.
- Dry-run result display:
  - For chain dry-run, show `Status: DRY_RUN`, `Mode`, optional `Manifest`, and `Scripts enabled: yes/no`.
  - For builder dry-run, show `Status: DRY_RUN` and `Goal characters`.
- `skills-browser.tsx` must render a card titled `Available skills` with a table using the existing `SkillSummary` fields: `id`, `source`, `description`, `chainRunnable`, `hasEntrypoint`, `referenceCount`, `scriptCount`, and `requiredPermissions`.
- In manifest builder/run help text, state: `Only chain-runnable skills can be used as chain steps. server.chain-builder authors manifests and is not offered as an executable step.` Filter any step-builder selector to `skill.chainRunnable && skill.id !== "server.chain-builder"`.
- Do not add MCP invocation in this change; there is no current CLI command for MCP invocation. Leave the existing MCP registry/settings UI unchanged.

### 9. Update README documentation after the GUI works
Depends on functional GUI/API behavior.

- In `README.md`, under `## Skill chains` and before `## Available npm scripts`, add a short `### Browser Automation GUI` subsection.
- Document:
  - Navigate to `/workspaces/<workspaceId>/automation` or the `Automation` link from a workspace.
  - Create manifests from goal text or imported text files.
  - Run new chains from pasted/imported manifest JSON, workspace manifest path, or workspace file selection.
  - Resume from a chain state path.
  - Use preview/dry-run buttons for side-effect-free validation.
  - Browser file imports replace CLI local path flags; local filesystem paths are never sent to the server.
- Keep the existing CLI documentation; add one sentence that the CLI and Automation GUI expose the same skill-chain workflows.

## Critical files & anchors

- `scripts/create-skill-chain.ts` — source of create-manifest CLI flags, dry-run behavior, goal input rules, and printed result fields that the new API/GUI must mirror.
- `scripts/run-skill-chain.ts` — source of run/resume CLI flags, mode validation, dry-run behavior, artifact listing, and resume handoff that the GUI must mirror.
- `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts` — existing browser API for real chain run/resume; extend here for dry-run and explicit manifest parsing.
- `src/server/skill-chains/builder.ts` — existing `buildSkillChainManifest` implementation and return shape; wrap it in the new manifest API rather than duplicating builder logic.
- `.omp/skills/react-ui-accessibility-reviewer/SKILL.md` — exact `.omp` skill metadata/body convention to copy for the new `browser-gui-ux-designer` skill.

## Verification

Run from repo root `C:/Users/joesa/Code/browser-agent-harness`.

- API/component unit coverage:

  ```bash
  npm run test -- "src/app/api/workspaces/[workspaceId]/skill-chain-manifests/route.test.ts" "src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts" "src/app/workspaces/[workspaceId]/automation/manifest-builder-form.test.tsx" "src/app/workspaces/[workspaceId]/automation/skill-chain-run-form.test.tsx" "src/app/workspaces/[workspaceId]/automation/skill-chain-result-panel.test.tsx"
  ```

- Type/lint checks:

  ```bash
  npm run typecheck
  npm run lint
  ```

- Add a Playwright dry-run E2E test in `tests/e2e/automation.spec.ts` that does not require `OPENROUTER_API_KEY`:
  1. Sign in as seeded `demo@example.com` / `demo-password`.
  2. Open `Demo Workspace`.
  3. Click `Automation`.
  4. Fill `Goal` with `Summarize workspace files.` and click `Preview manifest creation`; expect visible `Status: DRY_RUN` and `Goal characters:`.
  5. In `New run`, choose `Paste/import manifest JSON`, paste a valid one-step manifest using `server.research-synthesis`, fill `Initial input`, click `Preview chain run`; expect `Status: DRY_RUN`, `Mode: new`, and the manifest id.
  6. In `Resume`, fill `State file path` with `chains/example/run/chain-state.json`, click `Preview resume`; expect `Status: DRY_RUN` and `Mode: resume`.

  Command:

  ```bash
  npm run test:e2e -- tests/e2e/automation.spec.ts
  ```

  This test needs the same local app/database/auth environment as the existing E2E suite and the seeded demo user; it intentionally avoids model calls.

- Manual real-run smoke check when `OPENROUTER_API_KEY` or a workspace credential is available:
  1. Start the app with `npm run dev`.
  2. Sign in, open a workspace, and open `Automation`.
  3. Create a manifest from a short goal with a custom output path under `chains/manifests/`.
  4. Click `Use this manifest in run form`, run the chain with `server.research-synthesis`, and verify the result panel shows `SUCCEEDED`, `statePath`, `manifestPath`, `initialInputPath`, and at least one output link.
  5. Open the output link and verify the workspace file viewer shows the generated file.

## Assumptions & contingencies

- The accepted GUI organization is a dedicated workspace-level Automation page. Do not embed all chain controls into the existing workspace overview page; only add the `Automation` nav link there.
- The accepted skill location is `.omp/skills/browser-gui-ux-designer/SKILL.md`. Do not create this as an app/server skill under `skills/`; it is guidance for coding agents, not a browser-run chain step.
- Browser local-file equivalents are imports, not paths. If a CLI flag accepts a local path, the GUI reads the file in the browser and sends the text/object content to the existing server field.
- If `getWorkspaceAutomationData` proves unnecessary because `getWorkspaceOverview` already has every needed field, still create the narrower query to avoid loading audit logs and selected file text for the Automation page.
- If a future implementer finds another user-facing CLI script in `package.json` beyond `skill-chain:create` and `skill-chain`, add it to the Automation page or create a browser-equivalent page in the same implementation before declaring CLI parity complete.
