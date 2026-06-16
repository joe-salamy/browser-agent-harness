# Implementation status

Date: 2026-06-15

## Result

Implemented the greenfield MVP vertical slice for Browser Agent Harness.

## Implemented

- Next.js App Router scaffold with TypeScript, Tailwind, ESLint, and `.env.example`.
- Prisma schema for Auth.js, workspaces, files/versions, model credentials, runs, audit logs, MCP registry, and skills.
- Credentials auth with seeded demo user: `demo@example.com` / `demo-password`.
- Workspace shell:
  - create/list workspaces
  - edit workspace instructions
  - upload files
  - read/edit supported text files
  - download stored files
  - export workspace zip
  - review audit log
- Storage:
  - S3-compatible implementation for production-compatible object stores
  - local `.data/object-store` default when `S3_ENDPOINT` is unset
- Model layer:
  - AES-256-GCM credential encryption
  - OpenRouter adapter
  - model settings UI for save/revoke/default credential
- Minimal internal agent runtime behind the `AgentRuntime` interface.
- Built-in `core.research-synthesis` skill.
- MCP registry and permissions UI.
  - Remote MCP invocation is intentionally disabled in this MVP slice.
- Neutral demo data and `npm run demo:seed`.
- Vitest invariant tests and a Playwright MVP E2E spec.

## Verification run

Passed:

- `npx prisma generate`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
  - Result: 19 passed, 2 skipped.
  - Skipped tests are DB-backed integration cases when `DATABASE_URL` is absent.
- `npm run build`
- `npx prisma validate` with the development `DATABASE_URL` from `.env.example`

Security/regression checks performed:

- Searched route/service surfaces for workspace access gates.
- Verified file, run, model, MCP, audit, and export paths require authenticated workspace access through shared helpers/services.
- Searched audit metadata writes for secret-like keys.
- Confirmed no audit metadata write includes plaintext credential/API-key fields.
- Unit tests cover unsupported core text reads and audit metadata secret rejection.

## Not run

- Full Playwright E2E was not run because `OPENROUTER_API_KEY` was not set in the environment.
- The E2E spec is present and gated; run with a real key after local services and seed data are prepared.

## Local run notes

1. Install dependencies:

   ```bash
   npm install
   ```

2. Prepare PostgreSQL.

   Supported options:
   1. Native local default:
      - Install PostgreSQL 16 on Windows, preferably with:

        ```bash
        winget install -e --id PostgreSQL.PostgreSQL.16
        ```

        Use the official PostgreSQL installer if `winget` is unavailable.

      - Start the PostgreSQL Windows service if the installer did not start it.
      - Create the dev role/database once using `psql` connected as the local `postgres` admin user:

        ```bash
        psql -U postgres -h localhost -d postgres -c "CREATE USER bah WITH PASSWORD 'bah_dev_password';"
        psql -U postgres -h localhost -d postgres -c "CREATE DATABASE browser_agent_harness OWNER bah;"
        ```

        If either command reports the user/database already exists, keep the existing objects and continue.

   2. Hosted fallback:
      - Create a PostgreSQL database in Neon, Supabase, Railway, or another PostgreSQL-compatible provider.
      - Put that provider's pooled or direct connection string into `DATABASE_URL` in `.env.local`.
      - Do not change Prisma schema or app code for hosted PostgreSQL.

3. Create `.env.local` from `.env.example`.

   Copying `.env.example` now enables local object storage because no `S3_ENDPOINT` is present.

   Required local values:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `ENCRYPTION_MASTER_KEY`

   `ENCRYPTION_MASTER_KEY` must be 32 random bytes encoded as base64.

4. Seed demo data:

   ```bash
   npm run demo:seed
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Sign in with:
   - Email: `demo@example.com`
   - Password: `demo-password`

## Full E2E verification

Set `OPENROUTER_API_KEY`, then run:

```bash
npm run test:e2e
```

The Playwright scenario covers:

- sign-in
- opening `Demo Workspace`
- uploading `notes.md`
- saving workspace instructions
- saving an OpenRouter key
- running the minimal agent
- output file creation
- audit log events
- workspace zip export

## Implementation notes

- Prisma was pinned to 6.16.3 because Prisma 7 rejects the plan’s conventional `url = env("DATABASE_URL")` schema style without a separate Prisma config file.
- ESLint uses the native flat config exports from `eslint-config-next`; `FlatCompat` caused a circular config failure with the installed Next/ESLint versions.
- The workspace zip export uses a small internal no-compression ZIP writer to avoid adding a dependency.
- `npm run build` updated `tsconfig.json` to Next-managed defaults:
  - `jsx: "react-jsx"`
  - include `.next/dev/types/**/*.ts`
- `.data/` is gitignored for local object storage bytes.
- `.env.local` is intentionally not committed.

## Known constraints

- Real model success requires a valid OpenRouter key.
- MCP registry and permissions are implemented; remote MCP tool invocation is not enabled in this slice.
- Unsupported files can be stored and downloaded, but core text tools only read `.txt`, `.md`, `.json`, `.csv`, or supported text content types.
