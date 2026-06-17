# Browser Agent Harness

A browser-native foundation for building agent-powered knowledge-work products with authenticated workspaces, files, skills, MCP integrations, audit logs, and multi-model execution.

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment configuration:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in `.env.local`:

   | Variable                    | Required | Purpose                                                                                       |
   | --------------------------- | -------- | --------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`              | Yes      | PostgreSQL connection string used by Prisma.                                                  |
   | `NEXTAUTH_URL`              | Yes      | Public app URL, usually `http://localhost:3000` locally.                                      |
   | `NEXTAUTH_SECRET`           | Yes      | Auth.js session secret.                                                                       |
   | `AUTH_TRUST_HOST`           | Usually  | Set to `true` for trusted local/proxy hosts.                                                  |
   | `ENCRYPTION_MASTER_KEY`     | Yes      | Base64-encoded 32-byte key for encrypted model credentials.                                   |
   | `OPENROUTER_API_KEY`        | Optional | Fallback model API key when a workspace credential is not configured.                         |
   | `OPENROUTER_ALLOWED_MODELS` | Optional | Comma-separated model ids allowed in addition to the default OpenRouter model.                |
   | `BROWSER_AGENT_SKILL_ROOTS` | Optional | Extra server-installed skill roots, split by the OS path delimiter.                           |
   | `SKILL_SCRIPTS_ENABLED`     | Optional | Set to `true` to permit per-run directory skill entrypoint execution.                         |
   | `BASH_BIN`                  | Optional | Shell executable used for `.sh` skill entrypoints; defaults to `bash`.                        |
   | `PYTHON_BIN`                | Optional | Python executable used for `.py` skill entrypoints; defaults to `python`.                     |
   | `S3_ENDPOINT`               | Optional | Switches workspace file storage from local storage to S3-compatible storage at this endpoint. |
   | `S3_BUCKET`                 | Optional | S3 bucket name; defaults to `workspace-files`.                                                |
   | `S3_REGION`                 | Optional | S3 region; defaults to `us-east-1`.                                                           |
   | `S3_FORCE_PATH_STYLE`       | Optional | Use path-style S3 URLs when set to `true` or `1`.                                             |
   | `S3_ACCESS_KEY_ID`          | Optional | S3 access key; used only when paired with `S3_SECRET_ACCESS_KEY`.                             |
   | `S3_SECRET_ACCESS_KEY`      | Optional | S3 secret key; used only when paired with `S3_ACCESS_KEY_ID`.                                 |

4. Generate Prisma client and initialize the database:

   ```bash
   npm run prisma:generate
   npm run demo:seed
   ```

   The demo seed creates `demo@example.com` with password `demo-password` and several demo workspaces.

## Run thereafter

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with the seeded demo user, or use your own database records.

For production builds:

```bash
npm run build
npm run start
```

## Skills

Skills are reusable instructions, references, and optional scripts that a run may load. A browser-agent run can load zero, one, or many skills, then writes the result to an optional workspace output path. Skill-backed runs require editor access to the workspace and are audit logged.

Skill sources:

| Source    | ID format          | Where it comes from                                                                                         |
| --------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Workspace | `workspace.<name>` | Workspace files under `skills/<name>/SKILL.md`.                                                             |
| Server    | `server.<name>`    | Server directories under `skills/`, `.agents/skills/`, or any absolute root in `BROWSER_AGENT_SKILL_ROOTS`. |

Built-in harness skills are installed as server directory skills under `skills/<name>/SKILL.md`, so they use the same loading path as user-installed server skills.

Directory skills use this layout:

```text
skills/<name>/
  SKILL.md
  references/...   # optional text assets added as context
  scripts/...      # optional text/script assets added as context
```

`SKILL.md` must start with frontmatter:

```yaml
---
name: my-skill
description: What this skill does.
chainRunnable: true
entrypoint: scripts/run.js
---
Write the instructions the agent should follow.
```

`name` must match the directory name. `description` is required. `chainRunnable` defaults to `true`; set it to `false` for skills that should be callable directly but not inside skill chains. `entrypoint` is optional and must point inside `scripts/` to a `.js`, `.sh`, or `.py` file.

References and scripts are loaded as bounded text context. Entrypoint execution is stricter: deployment must set `SKILL_SCRIPTS_ENABLED=true`, and the individual run must opt in with the allow-scripts checkbox, API field, or CLI flag. Without both gates, entrypoint-backed skills fail before execution.

## Skill chains

Skill chains turn a larger workspace job into ordered skill runs. A chain manifest names the steps, chooses a chain-runnable skill for each step, gives each step its own prompt, and writes every step output back into the workspace. Each step receives the initial input file plus the successful outputs from earlier steps, so later steps can build on earlier artifacts instead of rediscovering context.

You can build chains for repeatable knowledge-work pipelines, for example:

- Research → implementation plan → worker-ready brief, as shown in `skill-chains/examples/research-plan-implementation.json`.
- Web-grounded market scan → sourced workspace summary → risks and next actions.
- Intake notes → normalized product brief → QA checklist → stakeholder summary.
- Directory-skill workflows that use workspace-specific instructions, reference packs, and script-backed preprocessing when scripts are explicitly enabled.

Chains are intentionally sequential and file-backed. They are best for deterministic handoffs where each intermediate artifact is useful on its own. They are not a hidden parallel executor, and `server.chain-builder` cannot be used as a chain step.

Manifest shape:

```json
{
  "version": 1,
  "id": "research-plan-implementation",
  "name": "Research to Plan to Implementation",
  "steps": [
    {
      "id": "market-research",
      "skillId": "server.research-synthesis",
      "prompt": "Produce market research for the supplied idea.",
      "outputPath": "chains/research-plan-implementation/{{runId}}/{{stepIndex}}-market-research.md"
    }
  ]
}
```

Manifest rules:

- `id` and step `id` values are lowercase slugs.
- `steps` must contain 1 to 20 unique steps.
- `skillId` must reference an available skill whose `chainRunnable` flag is `true`.
- `outputPath` is a workspace path template. Supported tokens are `{{runId}}`, `{{stepId}}`, and `{{stepIndex}}`; `{{stepIndex}}` renders as `01`, `02`, and so on.
- New runs copy the manifest, initial input, chain state, and step outputs under `chains/<manifest-id>/<run-id>/...`.

Use `npm run skill-chain:create` to generate a validated manifest from a goal. The builder sees workspace instructions, workspace file metadata, and the list of chain-runnable skills; it writes JSON only and retries once with a repair prompt if validation fails.

### Browser Automation GUI

The CLI and Automation GUI expose the same skill-chain workflows. Navigate to `/workspaces/<workspaceId>/automation` directly, or open a workspace and follow the `Automation` link.

Use the Automation page to create manifests from goal text or imported text files; run new chains from pasted or imported manifest JSON, a workspace manifest path, or a workspace file selection; and resume from a chain state path. Preview and dry-run buttons validate manifest creation, new runs, and resumes without side effects.

Browser file imports replace CLI local path flags. The browser reads selected local files and sends their text or parsed JSON content to the server; local filesystem paths are never sent.

## Available npm scripts

| Script                       | Command                                                                                            | Purpose                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `npm run dev`                | `next dev`                                                                                         | Run the local development server.            |
| `npm run build`              | `next build`                                                                                       | Build the Next.js app.                       |
| `npm run start`              | `next start`                                                                                       | Serve a production build.                    |
| `npm run lint`               | `eslint .`                                                                                         | Run lint checks.                             |
| `npm run typecheck`          | `tsc --noEmit`                                                                                     | Run TypeScript type checks without building. |
| `npm run test`               | `vitest run`                                                                                       | Run unit/integration tests once.             |
| `npm run test:watch`         | `vitest`                                                                                           | Run Vitest in watch mode.                    |
| `npm run test:e2e`           | `playwright test`                                                                                  | Run Playwright end-to-end tests.             |
| `npm run prisma:generate`    | `prisma generate`                                                                                  | Generate Prisma client.                      |
| `npm run prisma:migrate`     | `dotenv -e .env.local -- prisma migrate dev`                                                       | Apply development migrations.                |
| `npm run demo:seed`          | `dotenv -e .env.local -- prisma migrate dev --name init && dotenv -e .env.local -- prisma db seed` | Migrate and seed demo data.                  |
| `npm run skill-chain:create` | `tsx scripts/create-skill-chain.ts`                                                                | Generate a skill-chain manifest from a goal. |
| `npm run skill-chain`        | `tsx scripts/run-skill-chain.ts`                                                                   | Run or resume a skill chain.                 |

## Skill-chain CLI options

### Create a skill chain

```bash
npm run skill-chain:create -- --goal "Summarize the workspace files" --user-email demo@example.com --workspace-name "Demo Workspace"
```

Options:

| Option                    | Required                                      | Meaning                                                        |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `--goal <text>`           | One of `--goal` or `--goal-file`              | Goal prompt to turn into a manifest.                           |
| `--goal-file <path>`      | One of `--goal` or `--goal-file`              | Read the goal prompt from a local file.                        |
| `--user-email <email>`    | Yes                                           | User that owns or can edit the target workspace.               |
| `--workspace-id <id>`     | One of `--workspace-id` or `--workspace-name` | Target workspace by id.                                        |
| `--workspace-name <name>` | One of `--workspace-id` or `--workspace-name` | Latest matching workspace for the user.                        |
| `--model <model>`         | No                                            | Override the default model for manifest generation.            |
| `--output-path <path>`    | No                                            | Workspace path where the generated manifest should be written. |
| `--dry-run`               | No                                            | Validate inputs and print status without creating a manifest.  |

### Run a skill chain

```bash
npm run skill-chain -- --manifest skill-chains/examples/research-plan-implementation.json --input "Write the plan" --user-email demo@example.com --workspace-name "Demo Workspace"
```

New runs require exactly one manifest source and exactly one input source.

Manifest sources:

| Option                             | Meaning                                     |
| ---------------------------------- | ------------------------------------------- |
| `--manifest <path>`                | Read a local manifest file.                 |
| `--manifest-workspace-path <path>` | Read a manifest from a workspace file path. |
| `--manifest-file-id <id>`          | Read a manifest by workspace file id.       |

Input sources:

| Option                | Meaning                               |
| --------------------- | ------------------------------------- |
| `--input <text>`      | Initial input text for the chain.     |
| `--input-file <path>` | Read initial input from a local file. |

Common options:

| Option                    | Required                                      | Meaning                                                     |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `--user-email <email>`    | Yes                                           | User that owns or can edit the target workspace.            |
| `--workspace-id <id>`     | One of `--workspace-id` or `--workspace-name` | Target workspace by id.                                     |
| `--workspace-name <name>` | One of `--workspace-id` or `--workspace-name` | Latest matching workspace for the user.                     |
| `--model <model>`         | No                                            | Override the default model for the run.                     |
| `--allow-scripts`         | No                                            | Permit skill entrypoints when `SKILL_SCRIPTS_ENABLED=true`. |
| `--dry-run`               | No                                            | Validate inputs and print status without running the chain. |

When a run starts, the runner validates the manifest, copies the manifest and initial input into the workspace, creates `chain-state.json`, runs steps in order, updates state after each transition, and writes audit events for chain start, step start, step success or failure, and chain success or failure.

Resume a waiting or failed run with the state path printed by the previous command:

```bash
npm run skill-chain -- --resume-state-path <state-path> --user-email demo@example.com --workspace-id <workspace-id>
```

Resume options:

| Option                             | Meaning                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `--resume-state-path <path>`       | Resume from a saved chain state file.                           |
| `--manifest <path>`                | Optional replacement local manifest while resuming.             |
| `--manifest-workspace-path <path>` | Optional replacement workspace manifest path while resuming.    |
| `--manifest-file-id <id>`          | Optional replacement manifest workspace file id while resuming. |

Resume accepts at most one manifest source and does not accept `--input` or `--input-file`.
