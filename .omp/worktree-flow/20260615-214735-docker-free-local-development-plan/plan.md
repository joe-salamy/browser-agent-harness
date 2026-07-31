# Docker-free local development plan

## Context

The requested end state is: no Docker requirement for this repo, and no remaining Docker references in repo files, filenames, or docs. The best Docker-free default for this codebase is native PostgreSQL 16 on Windows plus the existing local `.data/object-store` file storage path. Keep hosted PostgreSQL as the documented fallback for machines where installing PostgreSQL locally is undesirable; do not add a hosted object-store dependency because `src/server/storage/index.ts` already selects `LocalObjectStore` when `S3_ENDPOINT` is unset.

Confirmed facts:

- `docker-compose.yml` exists only to run PostgreSQL 16 plus MinIO/MinIO init.
- `.env.example` currently includes a localhost `DATABASE_URL` plus MinIO-style `S3_*` variables; those `S3_*` variables make `getObjectStore()` choose `S3ObjectStore`.
- `src/server/storage/index.ts` returns `new LocalObjectStore()` when `process.env.S3_ENDPOINT` is unset.
- `LocalObjectStore` writes objects under `.data/object-store`, and `.gitignore` already ignores `.data/`.
- `prisma/schema.prisma` uses PostgreSQL through `DATABASE_URL`.
- `package.json` already depends on `dotenv-cli`, but `prisma:migrate` and `demo:seed` do not load `.env.local` today.
- Targeted search found explicit Docker setup text in `docs/status.md` and the Docker-named file `docker-compose.yml`. `docs/product-brief.md` has the generic term `container`; leave it because it is product sandbox language, not a Docker reference.

## Approach

1. Remove the Docker-only service definition.
   - Delete `docker-compose.yml`.
   - Do not replace it with another service manager file. The normal dev path must be app commands plus native/hosted PostgreSQL.
   - After deletion, a file search for Docker/Compose filenames must return no Docker-specific files.

2. Make local object storage the default environment path.
   - Edit `.env.example` to remove these six lines entirely:
     - `S3_ENDPOINT="http://localhost:9000"`
     - `S3_REGION="us-east-1"`
     - `S3_ACCESS_KEY_ID="minio"`
     - `S3_SECRET_ACCESS_KEY="minio_dev_password"`
     - `S3_BUCKET="workspace-files"`
     - `S3_FORCE_PATH_STYLE="true"`
   - Keep `DATABASE_URL="postgresql://bah:bah_dev_password@localhost:5432/browser_agent_harness?schema=public"` as the native-local default.
   - Keep `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_TRUST_HOST`, `ENCRYPTION_MASTER_KEY`, `OPENROUTER_API_KEY`, and `TAVILY_API_KEY` unchanged.
   - Do not edit `src/server/storage/index.ts`; its existing `process.env.S3_ENDPOINT ? new S3ObjectStore() : new LocalObjectStore()` branch is the desired behavior.
   - Failure handling: if a developer needs production-compatible S3 later, they can set `S3_ENDPOINT` and related credentials in their private `.env.local`; do not document MinIO or Docker as the local default.

3. Make Prisma scripts load `.env.local` explicitly.
   - Edit `package.json` scripts:
     - Change `"prisma:migrate": "prisma migrate dev"` to `"prisma:migrate": "dotenv -e .env.local -- prisma migrate dev"`.
     - Change `"demo:seed": "prisma migrate dev --name init && prisma db seed"` to `"demo:seed": "dotenv -e .env.local -- prisma migrate dev --name init && dotenv -e .env.local -- prisma db seed"`.
   - Leave `prisma:generate` unchanged; it does not need a database connection for this setup.
   - Do not change `package-lock.json`; `dotenv-cli` is already installed and recorded.
   - Edge handling: if `.env.local` is absent, these scripts should fail fast with Prisma’s missing `DATABASE_URL` error rather than silently using a different database.

4. Replace the docs setup flow with native PostgreSQL default plus hosted fallback.
   - Edit `docs/status.md` line 11 wording from “Docker Compose” to no Docker wording, e.g. `Next.js App Router scaffold with TypeScript, Tailwind, ESLint, and .env.example.`
   - Edit the Storage bullets:
     - Keep a production-facing S3-compatible bullet, but remove `MinIO` from the text.
     - State that local `.data/object-store` is the default when `S3_ENDPOINT` is unset.
   - Replace the current “Start local services” step that runs `docker compose up -d postgres minio minio-init` with a “Prepare PostgreSQL” step containing exactly these two supported options:
     1. Native local default:
        - Install PostgreSQL 16 on Windows, preferably with `winget install -e --id PostgreSQL.PostgreSQL.16` or the official PostgreSQL installer if `winget` is unavailable.
        - Start the PostgreSQL Windows service if the installer did not start it.
        - Create the dev role/database once using `psql` connected as the local `postgres` admin user:
          - `psql -U postgres -h localhost -d postgres -c "CREATE USER bah WITH PASSWORD 'bah_dev_password';"`
          - `psql -U postgres -h localhost -d postgres -c "CREATE DATABASE browser_agent_harness OWNER bah;"`
        - If either command reports the user/database already exists, keep the existing objects and continue.
     2. Hosted fallback:
        - Create a PostgreSQL database in Neon, Supabase, Railway, or another PostgreSQL-compatible provider.
        - Put that provider’s pooled or direct connection string into `DATABASE_URL` in `.env.local`.
        - Do not change Prisma schema or app code for hosted PostgreSQL.
   - Keep the `.env.local` step, but make it explicit that copying `.env.example` now enables local object storage because no `S3_ENDPOINT` is present.
   - Keep the `ENCRYPTION_MASTER_KEY` note.
   - Keep `npm run demo:seed` and `npm run dev` as the next steps.
   - Update implementation notes line 129 only if needed to say `.data/` is the default local object-storage location and is gitignored.
   - Update implementation notes line 130 only if needed to keep `.env.local` as the private local env file.
   - Do not add a README unless one already exists at implementation time; targeted `find` showed no `README.md` in the current workspace.

5. Remove remaining Docker/MinIO local-setup references.
   - Use a final repo search, excluding dependencies and generated output, for these patterns:
     - `docker|Docker|docker-compose|compose up`
     - `MinIO|minio|minio-init|minio_dev_password`
   - Expected remaining matches:
     - Zero matches for Docker patterns.
     - Zero matches for MinIO patterns after deleting `docker-compose.yml`, removing `.env.example` S3 defaults, and editing `docs/status.md`.
   - Do not remove generic product sandbox wording like `container` in `docs/product-brief.md`; it is not a Docker reference and removing it would change product requirements unrelated to this task.

## Critical files & anchors

- `docker-compose.yml` — delete the Docker-only PostgreSQL/MinIO service file.
- `.env.example` lines 1–13 — remove MinIO/S3 local defaults so local file storage is selected by default.
- `package.json` scripts `prisma:migrate` and `demo:seed` — load `.env.local` with existing `dotenv-cli`.
- `docs/status.md` setup section around lines 64–95 — replace Docker setup with native PostgreSQL and hosted PostgreSQL fallback instructions.
- `src/server/storage/index.ts` `getObjectStore()` — do not edit; this confirms removing `S3_ENDPOINT` is sufficient to use local storage.

## Verification

Run from repo root on Windows after implementing the edits.

1. Static cleanup checks with harness tools:
   - `find` paths: `["*docker*", "*compose*"]`, `gitignore: true`. Expected: no Docker/Compose files.
   - `search` pattern `docker|Docker|docker-compose|compose up` over `package.json`, `.env.example`, `prisma`, `src`, `scripts`, `docs/status.md`, `docs/product-brief.md`, `docs/market-research.md`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `next.config.ts`. Expected: zero matches.
   - `search` pattern `MinIO|minio|minio-init|minio_dev_password` over the same paths. Expected: zero matches.

2. Config/script validation:
   - Create or update `.env.local` from `.env.example`.
   - Set `DATABASE_URL` to either the native local value `postgresql://bah:bah_dev_password@localhost:5432/browser_agent_harness?schema=public` or a hosted PostgreSQL URL.
   - Set a real `ENCRYPTION_MASTER_KEY` value: 32 random bytes encoded as base64.
   - Run `npx dotenv -e .env.local -- prisma validate`. Expected: Prisma schema validates.
   - Run `npm run lint`. Expected: no lint errors.
   - Run `npm run test`. Expected: existing test suite passes; DB-backed integration tests run only when `DATABASE_URL` is available in the test environment, matching existing test guards.

3. New behavior smoke test:
   - Ensure `.env.local` does not contain `S3_ENDPOINT`.
   - Ensure native PostgreSQL is running, or use the hosted `DATABASE_URL` fallback.
   - Run `npm run demo:seed`.
   - Expected database behavior: Prisma applies the initial migration and seeds `demo@example.com` / `demo-password` plus demo workspaces.
   - Expected storage behavior: `.data/object-store` is created and contains seeded workspace file objects, proving the Docker-free local storage path was used.
   - Run `npm run dev`, sign in with `demo@example.com` / `demo-password`, open a seeded workspace, and download or view a seeded file. Expected: file access works without Docker, MinIO, or `S3_ENDPOINT`.

## Assumptions & contingencies

- Native PostgreSQL 16 is the default because the Prisma datasource is already PostgreSQL and keeping it avoids a database-engine migration. Hosted PostgreSQL is the fallback because it removes local database CPU/RAM usage without changing app code.
- If the native `CREATE USER` or `CREATE DATABASE` command reports the object already exists, continue with the existing role/database; do not drop local data.
- If a hosted provider requires SSL query parameters in `DATABASE_URL`, use the provider’s exact connection string unchanged in `.env.local`; do not encode provider-specific fallback logic in the repo.
- If implementation finds a new Docker mention not covered by the searches above, remove it when it is setup/tooling-specific. Leave generic non-Docker product language intact.
