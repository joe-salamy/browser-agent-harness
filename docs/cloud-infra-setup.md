# Cloud infrastructure setup

This app can run locally against managed cloud services. Start by copying `.env.example` to `.env.local`, then fill the variables below.

## 1. PostgreSQL

Recommended provider: [Neon](https://neon.com/pricing). It has a $0 free plan with no credit card, a generous enough hobby/prototype allowance, and serverless scale-to-zero behavior that keeps idle projects cheap.

Other reasonable managed PostgreSQL options:

| Provider                                                  | Best fit                                           | Cost/ease notes                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Neon](https://neon.com/pricing)                          | Most projects here                                 | Recommended: lowest-friction Postgres-only setup, free tier, no credit card, Prisma-friendly connection strings.         |
| [Supabase](https://supabase.com/pricing)                  | Projects that may also need auth, APIs, or storage | Free tier includes a dedicated Postgres database, but the free database size is smaller and inactive projects can pause. |
| [Railway](https://docs.railway.com/databases/postgresql/) | Deploying app services and Postgres together       | Very easy operationally, but starts around a paid hobby workflow and usage can grow with CPU/RAM/storage.                |

After provisioning the database, put its Prisma-compatible connection string in:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

After setting it, run the Prisma setup from the README:

```bash
npm run prisma:generate
npm run demo:seed
```

## 2. App URL and Auth.js session secret

Set the public URL users and auth callbacks will use:

```env
NEXTAUTH_URL="https://your-app.example.com"
```

For local development, use `http://localhost:3000`. Generate a high-entropy session secret and set:

```env
NEXTAUTH_SECRET="..."
AUTH_TRUST_HOST="true"
```

Use `AUTH_TRUST_HOST=true` when the app runs behind a trusted proxy or hosted platform that forwards the public host.

## 3. Credential encryption key

Generate a base64-encoded 32-byte key for encrypting stored model credentials:

```bash
openssl rand -base64 32
```

Set the result as:

```env
ENCRYPTION_MASTER_KEY="..."
```

Keep this key stable across deploys. Rotating or losing it can make existing encrypted credentials unreadable.

## 4. Model provider fallback

Workspace-level credentials are preferred. To configure a server fallback OpenRouter key, create an OpenRouter API key and set:

```env
OPENROUTER_API_KEY="..."
```

Optionally allow more OpenRouter model IDs beyond the app default:

```env
OPENROUTER_ALLOWED_MODELS="openrouter/model-a,openrouter/model-b"
```

## 5. Server-installed skills and skill entrypoints

If the deployment should expose extra server-installed skills, mount or bake those skill directories into the server and set OS-delimited paths:

```env
BROWSER_AGENT_SKILL_ROOTS="/app/skills:/opt/company-skills"
```

Use `;` instead of `:` on Windows. If skill entrypoint scripts should run, explicitly enable them and point to the runtime binaries available in the server image:

```env
SKILL_SCRIPTS_ENABLED="true"
BASH_BIN="bash"
PYTHON_BIN="python"
```

Leave `SKILL_SCRIPTS_ENABLED` unset unless the deployment intentionally trusts those skill entrypoints.

## 6. S3-compatible workspace file storage

By default, workspace files use local storage. For cloud storage, provision an S3-compatible bucket and set:

```env
S3_ENDPOINT="https://s3.example.com"
S3_BUCKET="workspace-files"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
```

Set path-style URLs only when your S3-compatible provider requires them:

```env
S3_FORCE_PATH_STYLE="true"
```

If `S3_ENDPOINT` is unset, the app stays on local workspace file storage. If access keys are used, set both `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` together.

## Minimal cloud checklist

- PostgreSQL database reachable from the app: `DATABASE_URL`.
- Public app URL and Auth.js secret: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, usually `AUTH_TRUST_HOST=true`.
- Stable credential encryption key: `ENCRYPTION_MASTER_KEY`.
- Optional model fallback: `OPENROUTER_API_KEY`, `OPENROUTER_ALLOWED_MODELS`.
- Optional installed skills: `BROWSER_AGENT_SKILL_ROOTS`, `SKILL_SCRIPTS_ENABLED`, `BASH_BIN`, `PYTHON_BIN`.
- Optional S3-compatible file storage: `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
