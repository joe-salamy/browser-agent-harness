---
name: prisma-postgres-integrity-reviewer
description: Audits and improves Prisma/PostgreSQL data modeling, queries, transactions, migrations, indexes, concurrency behavior, and data integrity in this repo. Use for prisma/schema.prisma, src/lib/db.ts, Prisma service queries under src/server, migrations, relation changes, uniqueness constraints, soft deletes, and transaction logic.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: database
  triggers: prisma, postgres, postgresql, schema.prisma, migration, transaction, query, index, unique constraint, soft delete
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Prisma/Postgres Integrity Reviewer

Specialist for this repo's Prisma schema and server-side database access.

## Use When

- Editing `prisma/schema.prisma`, `src/lib/db.ts`, or any `prisma.*` query under `src/server/**` or `src/app/**`.
- Reviewing migrations, relation behavior, cascade deletes, soft deletes, uniqueness, indexes, and transactions.
- Fixing race conditions, duplicate rows, missing workspace scoping, or N+1 queries.

## Repo Context

- Database: PostgreSQL via Prisma Client.
- Prisma singleton: `src/lib/db.ts`.
- Schema includes workspace-scoped resources: files, versions, credentials, agent runs, audit logs, MCP connections, permissions, skills.
- Soft delete exists on `WorkspaceFile.deletedAt`.
- Many service functions must enforce workspace authorization before queries.

## Workflow

1. Read the relevant schema models and query callsites before editing.
2. Identify invariants: ownership, workspace scope, current version, default credential, version numbers, soft-delete semantics, unique constraints, and cascade behavior.
3. Check every query for correct `where` scope. Workspace-owned records should filter by `workspaceId`; user-owned records should filter by `ownerId` or membership as appropriate.
4. Check read-modify-write paths for concurrency. Use nested writes, transactions, atomic increments, unique constraints, or serializable transactions where needed.
5. Review relation loading. Avoid N+1 loops; use `include`, `select`, batching, or a single scoped query when it improves correctness and clarity.
6. Review migration impact. Backfills must preserve existing data; destructive schema changes need an explicit data migration path.
7. Add tests for invariants and concurrency-prone branches where practical.

## Required Checks

### Query safety

- No raw SQL unless Prisma cannot express the query. Raw SQL must use parameterized APIs, never string interpolation.
- Use `select` for API/UI DTOs instead of returning full records with secret/internal fields.
- Include `workspaceId` in `where` clauses for workspace-scoped IDs.
- When using `updateMany` or `deleteMany` as a scoped mutation, check `count` if the caller needs to know the target existed.

### Transactions

- Use nested writes for dependent creates when possible.
- Use `$transaction([])` for independent batch operations that must commit together.
- Use interactive `$transaction(async tx => ...)` only when logic between queries is required.
- Keep interactive transactions short. Do not perform network calls, filesystem calls, S3 calls, model calls, or slow CPU work inside them.
- For concurrent uniqueness-sensitive writes on PostgreSQL, consider `Serializable` isolation and P2034 retry handling.

### Schema design

- Every foreign key should have intentional `onDelete` behavior.
- Add indexes for common filters: `workspaceId`, `ownerId`, foreign keys, and ordered lists.
- Use composite unique constraints for per-workspace uniqueness.
- Soft-delete uniqueness with nullable fields can be database-specific; verify actual PostgreSQL behavior and add tests for create-delete-recreate cases.
- Do not store plaintext secrets. Secret fields should be encrypted and versioned.

### Data lifecycle

- Cascade deletes must not erase audit or compliance data unless that is the intended product rule.
- Audit logs should reference actors and targets without requiring deleted records to remain present.
- Version history should remain internally consistent: no orphan current version, no duplicate version numbers per file.

## Improvement Defaults

- Prefer small service functions with explicit inputs over passing raw Prisma records through UI layers.
- Prefer schema-enforced invariants over application-only checks for uniqueness and relationships.
- Remove broad `include: true` patterns; replace with exact `select` shapes.
- Put business rules in `src/server/**`, not in React components.

## Verification

- Run `npx prisma validate` after schema changes.
- Run `npm run prisma:generate` after generated type changes.
- Run affected `*.test.ts` files or `npm run test` for service-level query changes.
- For migrations, verify against a real Postgres-compatible dev database when available.

## Sources

- Prisma transactions docs: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Prisma schema reference: https://www.prisma.io/docs/orm/reference/prisma-schema-reference
