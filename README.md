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
   | `TAVILY_API_KEY`            | Optional | Enables web-search grounding skills.                                                          |
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

## Available npm scripts

| Script                       | Command                                                                                            | Purpose                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `npm run dev`                | `next dev`                                                                                         | Run the local development server.            |
| `npm run build`              | `next build`                                                                                       | Build the Next.js app.                       |
| `npm run start`              | `next start`                                                                                       | Serve a production build.                    |
| `npm run lint`               | `eslint .`                                                                                         | Run lint checks.                             |
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
| `--dry-run`               | No                                            | Validate inputs and print status without running the chain. |

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
