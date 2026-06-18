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
   | `BASH_BIN`                  | Optional | Shell executable used for `.sh` skill entrypoints; defaults to `bash`.                       |
   | `PYTHON_BIN`                | Optional | Python executable used for `.py` skill entrypoints; defaults to `python`.                    |
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

| Source | ID format | Where it comes from |
| ------ | --------- | ------------------- |
| Workspace | `workspace.<name>` | Workspace files under `skills/<name>/SKILL.md`. |
| Server | `server.<name>` | Server directories under `skills/`, `.agents/skills/`, or any absolute root in `BROWSER_AGENT_SKILL_ROOTS`. |

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
entrypoint: scripts/run.js
---
Write the instructions the agent should follow.
```

`name` must match the directory name; `description` is required; `entrypoint` is optional and must point inside `scripts/` to a `.js`, `.sh`, or `.py` file.

References and scripts are loaded as bounded text context. Entrypoint execution is stricter: deployment must set `SKILL_SCRIPTS_ENABLED=true`, and the individual run must opt in with the allow-scripts checkbox or API field. Without both gates, entrypoint-backed skills fail before execution.


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

