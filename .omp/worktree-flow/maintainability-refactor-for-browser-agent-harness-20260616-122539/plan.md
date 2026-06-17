# Maintainability Refactor for Browser Agent Harness

## Context

The ask is to refactor this frontend + backend repo using current best practices, clean up bloat, and simplify code where possible. The selected priority is maintainability, with small UX improvements allowed when they reduce code and do not change product rules. Verified repo shape: private Next.js/React/TypeScript App Router app; `src/app` contains pages, Route Handlers, Server Actions, and four client islands; `src/server` contains workspace, storage, model, MCP, agent, skill, and skill-chain services; `src/lib` contains auth and Prisma; tests are colocated Vitest files plus one Playwright E2E spec.

External guidance used for this plan: Next.js data security recommends one data-fetching approach and a server-only DAL returning minimal DTOs (https://nextjs.org/docs/app/guides/data-security); Next.js Server/Client Components docs recommend Server Components by default and tiny client boundaries for browser state/effects (https://nextjs.org/docs/app/getting-started/server-and-client-components); TypeScript strict mode gives stronger correctness guarantees and is already enabled (https://www.typescriptlang.org/tsconfig/strict.html); Prisma performance guidance recommends one PrismaClient, avoiding over-fetching, and avoiding N+1 patterns (https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance); Testing Library recommends tests that resemble user behavior (https://testing-library.com/docs/guiding-principles).

## Approach

1. Establish refactor guardrails before editing.
   - Re-run these exact searches and keep the plan’s assumptions only if they still match:
     - `search` pattern `^"use client"|^'use client'` in `src/**/*.tsx`; expected client islands are `src/app/(auth)/sign-in/sign-in-form.tsx`, `src/app/workspaces/[workspaceId]/run-form.tsx`, `src/app/workspaces/[workspaceId]/upload-form.tsx`, and `src/app/workspaces/[workspaceId]/refresh-listener.tsx`.
     - `search` pattern `@/lib/db|@/lib/auth|@/server/` in `src/app/**/*.tsx`; expected direct Prisma page imports are `src/app/workspaces/page.tsx` and `src/app/workspaces/[workspaceId]/page.tsx`.
     - `search` pattern `createSignedDownloadUrl|/api/object-download` in `src`, `scripts`, `tests`, and `package.json`; expected production callers are none.
     - `search` pattern `clsx|lucide-react|nanoid|tailwind-merge` in `src`, `scripts`, `tests`, and `package.json`; expected matches are only `package.json`.
   - No LSP server is configured for this project. For every exported symbol changed below, use `search` for exact symbol names before editing and update every returned callsite. Do not leave compatibility aliases.

2. Move workspace page reads into a narrow server data layer.
   - In `src/server/workspaces/access.ts`, add this exported type and function without changing role semantics:

     ```ts
     export type WorkspaceMembershipAccess = {
       workspace: Workspace;
       role: WorkspaceRole;
     };

     export async function requireWorkspaceMembership(
       userId: string,
       workspaceId: string,
       minimumRole: WorkspaceRole,
     ): Promise<WorkspaceMembershipAccess>;
     ```

   - Implement `requireWorkspaceMembership` with the existing `prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, include: { workspace: true } })` query and existing `hasRoleAtLeast`; throw `WorkspaceAccessError` on missing membership or insufficient role.
   - Refactor `assertWorkspaceAccess` to call `requireWorkspaceMembership(...)` and return only `.workspace`, preserving its exported signature `Promise<Workspace>` and all existing callsites.
   - Add `src/server/workspaces/queries.ts` for server-only page read models. New exported symbols:

     ```ts
     export type WorkspaceListItem = {
       id: string;
       name: string;
       role: WorkspaceRole;
     };

     export type WorkspaceSelectedText = {
       fileId: string;
       path: string;
       text?: string;
       unsupported?: string;
     };

     export type WorkspaceOverview = {
       workspace: Workspace;
       files: WorkspaceFileWithCurrentVersion[];
       skills: SkillSummary[];
       logs: Awaited<ReturnType<typeof listAuditLogs>>;
       canEdit: boolean;
       selected: WorkspaceSelectedText | null;
     };

     export async function listUserWorkspaces(
       userId: string,
     ): Promise<WorkspaceListItem[]>;

     export async function getWorkspaceOverview(input: {
       userId: string;
       workspaceId: string;
       selectedFileId?: string;
     }): Promise<WorkspaceOverview>;
     ```

   - `listUserWorkspaces` must use `prisma.workspaceMember.findMany` with `select: { role: true, workspace: { select: { id: true, name: true } } }`, `where: { userId }`, and existing `orderBy: { workspace: { updatedAt: "desc" } }`; return DTOs `{ id, name, role }`, not raw `WorkspaceMember` records.
   - `getWorkspaceOverview` must call `requireWorkspaceMembership(userId, workspaceId, WorkspaceRole.VIEWER)` once, compute `canEdit` with `hasRoleAtLeast(role, WorkspaceRole.EDITOR)`, load `listWorkspaceFiles`, `listAvailableSkills`, and `listAuditLogs`, then derive `selected` using the current selected-file logic from `src/app/workspaces/[workspaceId]/page.tsx`. Preserve unsupported text behavior: `UnsupportedTextFileError` message is shown; other read errors become `"File could not be read."`; unknown `selectedFileId` yields `selected: null`.
   - Keep service-level authorization inside `listWorkspaceFiles`, `listAvailableSkills`, `listAuditLogs`, and `readWorkspaceTextFile`; do not add “trusted” bypasses.
   - Update `src/app/workspaces/page.tsx` to import `listUserWorkspaces` instead of `prisma`; render `WorkspaceListItem` DTOs with the existing card layout and empty state.
   - Update `src/app/workspaces/[workspaceId]/page.tsx` to import `getWorkspaceOverview` and remove direct `prisma`, `assertWorkspaceAccess`, `listWorkspaceFiles`, `listAvailableSkills`, `listAuditLogs`, `readWorkspaceTextFile`, and `UnsupportedTextFileError` imports. The page should only handle auth redirect, route params/search params, data retrieval, and JSX rendering.
   - Add tests:
     - Add `src/server/workspaces/access.membership.test.ts` with a hoisted mock for `@/lib/db`; cover successful role return, insufficient role throwing `WorkspaceAccessError`, missing membership throwing `WorkspaceAccessError`, and `assertWorkspaceAccess` still returning only the workspace.
     - Add `src/server/workspaces/queries.test.ts` with hoisted mocks for Prisma and the called server services; cover DTO shape for `listUserWorkspaces`, `canEdit` true for EDITOR/OWNER and false for VIEWER, supported selected text, unsupported selected text, non-`UnsupportedTextFileError` fallback, and unknown selected file.

3. Consolidate request/form parsing at server boundaries.
   - Add `src/server/request-parsing.ts` with these exact exports:
     ```ts
     export function firstFormDataString(
       formData: FormData,
       field: string,
     ): string | null;
     export function formDataString(formData: FormData, field: string): string;
     export function optionalTrimmedFormDataString(
       formData: FormData,
       field: string,
     ): string | undefined;
     export function formDataStringList(
       formData: FormData,
       field: string,
     ): string[];
     export function optionalFormDataBoolean(
       formData: FormData,
       field: string,
     ): boolean;
     export function parseJsonObject(value: unknown): Record<string, unknown>;
     export function optionalJsonString(
       record: Record<string, unknown>,
       field: string,
     ): string | undefined;
     export function optionalJsonBoolean(
       record: Record<string, unknown>,
       field: string,
     ): boolean | undefined;
     ```
   - `firstFormDataString` must inspect all values for a field, throw `new Error("Invalid request body.")` if any value is not a string, and return the first string or `null`. This preserves `agent-runs` rejection of File-valued repeated fields.
   - `formDataString` returns `firstFormDataString(...) ?? ""` without trimming; use it for workspace instructions, text content, labels, API keys, IDs, paths, and URLs where existing services perform their own trimming/validation.
   - `optionalTrimmedFormDataString` trims and returns `undefined` for missing/blank values.
   - `formDataStringList` must inspect every value for the field, throw `new Error("Invalid request body.")` for non-string values, trim strings, drop blank strings, and preserve request order for the remaining values.
   - `optionalFormDataBoolean` preserves the current accepted values: missing -> `false`; `true`, `1`, `on` -> `true`; `false`, `0`, `off` -> `false`; anything else throws `"Invalid request body."`.
   - `parseJsonObject` throws `"Invalid request body."` unless the value is a non-array object.
   - `optionalJsonString` trims and returns `undefined` for missing/blank values; non-string values throw `"Invalid request body."`.
   - `optionalJsonBoolean` returns `undefined` when the field is absent; non-boolean values throw `"Invalid request body."`.
   - Update `src/app/api/workspaces/[workspaceId]/agent-runs/route.ts` to import the FormData helpers and delete its local helper functions. Preserve response behavior: blank or missing prompt returns `{ error: "Prompt is required." }` with status 400; `UnknownSkillError` still maps to 404.
   - Update `src/app/api/workspaces/[workspaceId]/skill-chains/route.ts` to import JSON helpers and delete local `optionalStringField`, `optionalBooleanField`, and `parseBody`. Keep the explicit route-level `assertWorkspaceAccess(userId, workspaceId, WorkspaceRole.EDITOR)` before `runSkillChain`; it preserves the current 403-before-run behavior for unauthorized users.
   - Update `src/app/workspaces/actions.ts` to use `formDataString` and `optionalFormDataBoolean` instead of scattered `String(formData.get(...) ?? "")` and checkbox comparisons. Preserve existing revalidation paths.
   - Add `src/server/request-parsing.test.ts` covering repeated string fields, File-valued rejection, optional trimming, accepted boolean values, rejected boolean values, JSON object parsing, and optional JSON field validation.
   - Update existing route/action tests only where imports or helper behavior changed; do not loosen assertions.

4. Stop loading whole workspace text files into agent context when a capped reader already exists.
   - In `src/server/agents/minimal-runtime.ts`, replace the import of `readWorkspaceTextFile` with `readWorkspaceTextFileCapped`.
   - In the readable-file loop, compute `remaining = MAX_INLINE_CONTEXT_CHARS - usedChars` before reading. If `remaining <= 0`, set global `truncated = true` and stop.
   - Call `readWorkspaceTextFileCapped(input.userId, input.workspaceId, file.id, remaining)` and push the returned text directly. Mark each content block `truncated: read.truncated`; increment `usedChars` by `read.text.length`; if `read.truncated` is true or `usedChars >= MAX_INLINE_CONTEXT_CHARS`, set global `truncated = true` and stop.
   - Keep the existing global cap constant name and value `MAX_INLINE_CONTEXT_CHARS = 80_000`. The service cap is byte-based; the runtime must still treat the 80,000 limit as an upper bound for included text and must not read full file contents just to slice them.
   - Update `src/server/agents/minimal-runtime.test.ts` mocks to expose `readWorkspaceTextFileCapped` instead of `readWorkspaceTextFile`.
   - Add a runtime test proving a large readable file calls `readWorkspaceTextFileCapped` with the remaining cap, passes truncated content to the model context, and does not call the old full-file reader.

5. Delete unused presigned download plumbing and its dependency.
   - Remove `createSignedDownloadUrl` from `src/server/storage/object-store.ts`.
   - Remove `createSignedDownloadUrl` implementations from `src/server/storage/local-object-store.ts` and `src/server/storage/s3-object-store.ts`.
   - Remove `getSignedUrl` and `@aws-sdk/s3-request-presigner` imports from `src/server/storage/s3-object-store.ts`.
   - In `src/server/storage/local-object-store.test.ts`, delete only the `store.createSignedDownloadUrl(...)` assertion inside the unsafe-key table test and keep the `store.putObject(...)` invalid-key assertion.
   - Do not create `/api/object-download`; current workspace downloads use `src/app/api/workspaces/[workspaceId]/files/[fileId]/download/route.ts`, which streams bytes through `getWorkspaceFileDownload()`.
   - After the code removal, remove `@aws-sdk/s3-request-presigner` from `package.json` and `package-lock.json` through the package cleanup step below.

6. Reduce duplicated skill-chain CLI plumbing without changing CLI flags or output text.
   - Add `scripts/skill-chain-cli.ts` with these exact exports:

     ```ts
     export type UserWorkspaceArgs = {
       workspaceId?: string;
       workspaceName?: string;
       userEmail?: string;
     };

     export type ResolvedUserWorkspace = {
       userId: string;
       workspaceId: string;
       userEmail: string;
     };

     export function shellQuote(value: string): string;
     export function formatSkillChainCommand(
       args: Record<string, string>,
       flags?: string[],
     ): string;
     export async function resolveUserWorkspace(
       args: UserWorkspaceArgs,
     ): Promise<ResolvedUserWorkspace>;
     ```

   - Move the existing OS-specific `shellQuote` behavior exactly from the two scripts: Windows uses single quotes and doubles embedded single quotes; other platforms uses POSIX single-quote escaping.
   - Move `formatSkillChainCommand` from `scripts/run-skill-chain.ts`; default `flags` to `[]`; output must remain `npm run skill-chain -- ...` with `--name quotedValue` pairs and trailing boolean flags.
   - Move the shared Prisma user/workspace lookup and `assertWorkspaceAccess(..., WorkspaceRole.EDITOR)` into `resolveUserWorkspace`. Preserve exact error messages: `"--user-email is required."`, `"Provide exactly one of --workspace-id or --workspace-name."`, `User not found: ${email}.`, and `"Workspace not found."`.
   - Update `scripts/create-skill-chain.ts` and `scripts/run-skill-chain.ts` to import these utilities and delete their local duplicates. Keep each script’s distinct `ParsedArgs`, `parseArgs`, mode validation, read-file handling, console output, and `prisma.$disconnect()` in `finally`.
   - Add `scripts/skill-chain-cli.test.ts` covering `formatSkillChainCommand` on the current platform, `shellQuote` for a value containing a single quote using the current platform’s expected escaping, and `resolveUserWorkspace` with mocked Prisma/access. Do not change production quoting behavior for test convenience.

7. Simplify repeated UI styling and the upload refresh flow while preserving tiny client islands.
   - In `src/app/globals.css`, add these utility classes using existing CSS variables:
     ```css
     .page {
       padding-block: 32px;
     }
     .with-top-gap {
       margin-top: 20px;
     }
     .align-start {
       align-items: start;
     }
     .check-row {
       display: flex;
       gap: 8px;
       align-items: center;
     }
     .error-text {
       color: #b91c1c;
     }
     ```
   - Replace repeated `style={{ padding: "32px 0" }}` in `src/app/workspaces/page.tsx`, `src/app/workspaces/[workspaceId]/page.tsx`, `src/app/workspaces/[workspaceId]/settings/models/page.tsx`, and `src/app/workspaces/[workspaceId]/settings/mcp/page.tsx` with `className="container page"`.
   - In `src/app/workspaces/[workspaceId]/page.tsx`, change the header to `className="grid two align-start"`, both two-column content wrappers to `className="grid two with-top-gap"`, and the audit section to `className="card with-top-gap"`.
   - In `src/app/workspaces/[workspaceId]/settings/models/page.tsx`, change the saved-credentials section to `className="card with-top-gap"`. In `src/app/workspaces/[workspaceId]/settings/mcp/page.tsx`, change the connections section to `className="grid with-top-gap"`.
   - In `src/app/workspaces/[workspaceId]/run-form.tsx`, replace checkbox row inline styles with `className="check-row"` and replace red inline error styles with `className="error-text"`; keep accessible labels, alert role, and result text unchanged.
   - In `src/app/workspaces/[workspaceId]/upload-form.tsx`, replace `window.location.reload()` after successful upload with `window.dispatchEvent(new Event("workspace-updated"))`, matching `RunForm` and the existing `RefreshListener`. Keep `setMessage("Uploaded.")` and `form.reset()`.
   - Add `src/app/workspaces/[workspaceId]/upload-form.test.tsx` using `// @vitest-environment jsdom`, Testing Library, `userEvent`, and a stubbed `fetch`; cover successful upload dispatching `workspace-updated`, form reset/message display, and failed upload showing the response error without dispatching the event.

8. Normalize package metadata and remove dependency bloat after code cleanup compiles.
   - In `package.json`, add script `"typecheck": "tsc --noEmit"` next to `lint` and `test`.
   - Remove runtime dependencies `clsx`, `lucide-react`, `nanoid`, and `tailwind-merge` because verified searches found no imports outside `package.json`.
   - Remove runtime dependency `@aws-sdk/s3-request-presigner` after step 5 removes its only import.
   - Remove direct dev dependency `playwright`; keep `@playwright/test` because `playwright.config.ts` imports from `@playwright/test` and `@playwright/test` already brings the Playwright runtime.
   - Replace `latest` and caret ranges in direct dependencies with the currently locked exact versions:
     - dependencies: `@auth/prisma-adapter` `2.11.2`; `@aws-sdk/client-s3` `3.1068.0`; `@prisma/client` `6.16.3`; `bcryptjs` `3.0.3`; `next` `16.2.9`; `next-auth` `4.24.14`; `openai` `6.42.0`; `prisma` `6.16.3`; `react` `19.2.7`; `react-dom` `19.2.7`; `yaml` `2.9.0`; `zod` `4.4.3`.
     - devDependencies: `@eslint/eslintrc` `3.3.5`; `@playwright/test` `1.60.0`; `@tailwindcss/postcss` `4.3.1`; `@testing-library/jest-dom` `6.9.1`; `@testing-library/react` `16.3.2`; `@testing-library/user-event` `14.6.1`; `@types/bcryptjs` `3.0.0`; `@types/node` `25.9.3`; `@types/react` `19.2.17`; `@types/react-dom` `19.2.3`; `dotenv-cli` `11.0.0`; `eslint` `9.39.4`; `eslint-config-next` `16.2.9`; `jsdom` `29.1.1`; `tailwindcss` `4.3.1`; `tsx` `4.22.4`; `typescript` `6.0.3`; `vitest` `4.1.8`.
   - Run `npm install --package-lock-only --ignore-scripts` from the repo root after editing `package.json` so `package-lock.json` root metadata and dependency graph match the new manifest without running lifecycle scripts.
   - Update `README.md` script tables to add `npm run typecheck` with command `tsc --noEmit` and purpose `Run TypeScript type checks without building.` Keep existing setup, demo seed, skill, and skill-chain docs unchanged.

## Critical files & anchors

- `package.json` — scripts and direct dependency surface; add `typecheck`, pin exact direct versions, and remove verified unused packages.
- `src/server/workspaces/access.ts` — role-rank authority; add `requireWorkspaceMembership` while preserving `assertWorkspaceAccess`.
- `src/app/workspaces/[workspaceId]/page.tsx` — largest Server Component; remove direct data-access logic and keep JSX/rendering only.
- `src/server/agents/minimal-runtime.ts` — file context assembly; switch from full reads to `readWorkspaceTextFileCapped`.
- `src/server/storage/object-store.ts` — storage interface fanout; deleting `createSignedDownloadUrl` drives local/S3/test/package cleanup.

## Verification

- From repo root, run `npm run typecheck`; expected result: TypeScript completes with no errors using `tsc --noEmit`.
- From repo root, run `npm run lint`; expected result: Next/ESLint completes with no errors and no unused imports after dependency/interface deletions.
- From repo root, run `npm run test -- src/server/workspaces/access.test.ts src/server/workspaces/queries.test.ts src/server/request-parsing.test.ts`; expected result: role helper, workspace page DAL, and parser behavior pass.
- From repo root, run `npm run test -- src/app/api/workspaces/[workspaceId]/agent-runs/route.test.ts src/app/api/workspaces/[workspaceId]/skill-chains/route.test.ts src/app/workspaces/[workspaceId]/run-form.test.tsx src/app/workspaces/[workspaceId]/upload-form.test.tsx`; expected result: route parsing, skill-chain route behavior, run form, and upload refresh behavior pass.
- From repo root, run `npm run test -- src/server/agents/minimal-runtime.test.ts src/server/storage/local-object-store.test.ts src/server/skill-chains/runner.test.ts scripts/skill-chain-cli.test.ts`; expected result: capped agent reads, storage cleanup, runner compatibility, and shared CLI helpers pass.
- From repo root, run `npm run test`; expected result: all non-E2E Vitest tests pass. Integration tests that require `DATABASE_URL` may skip when it is unset; do not count skipped DB integration tests as proof of persistence behavior.
- With `DATABASE_URL` set to a disposable test database, run `npm run test -- src/server/workspaces/files.integration.test.ts src/server/skill-chains/runner.integration.test.ts`; expected result: file persistence/versioning and skill-chain state persistence still pass.
- From repo root, run `npm run build`; expected result: Next build and route/server/client boundaries compile after package and App Router refactors.
- Manual UI smoke check with the dev server and seeded demo data: sign in, open a workspace, upload a text file, confirm the file list refreshes without a full page reload, run an agent with no selected skills, open the output file link, and confirm workspace/audit export links still download.
- If `OPENROUTER_API_KEY` is available and demo data is seeded, run `npm run test:e2e`; expected result: the Playwright MVP flow passes. If the key is absent, record that E2E coverage was not exercised instead of claiming it passed.

## Assumptions & contingencies

- Preserve behavior by default. The only planned UX change is replacing upload `window.location.reload()` with the existing `workspace-updated` refresh event; if that event does not refresh the file list during manual smoke, revert only that line to reload and keep the rest of the UI cleanup.
- Do not remove `SkillDefinition` from `prisma/schema.prisma` in this refactor. It appears unused by runtime discovery, but there is no `prisma/migrations` directory and schema deletion is a data-model migration rather than low-risk bloat cleanup.
- Do not move `prisma` from dependencies to devDependencies in this refactor. The current scripts use Prisma CLI directly; dependency-class changes can be handled only with deployment knowledge.
- If a re-run search finds new imports of any planned-to-remove package or `createSignedDownloadUrl`, keep that package or method and update only verified-unused items. Do not stub replacements.
- Test `scripts/skill-chain-cli.ts` quoting on the current platform only; do not stub `process.platform` and do not change production quoting behavior for test convenience.
