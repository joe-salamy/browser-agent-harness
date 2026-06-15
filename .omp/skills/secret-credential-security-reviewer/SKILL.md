---
name: secret-credential-security-reviewer
description: Audits and improves secret handling, encrypted model credentials, environment variables, AES-GCM usage, key versioning, credential revocation, logging, and exposure risks in this repo. Use for src/server/security/encryption.ts, src/server/models/credentials.ts, auth secrets, API keys, environment variables, audit logs, and credential UI/API changes.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: security
  triggers: secret, credential, encryption, api key, aes-gcm, env, ENCRYPTION_MASTER_KEY, OPENROUTER_API_KEY, revocation
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Secret and Credential Security Reviewer

Specialist for secrets, encrypted model credentials, key handling, environment variables, logging, and credential lifecycle in this repo.

## Use When

- Editing `src/server/security/encryption.ts`, `src/server/models/credentials.ts`, auth config, model provider adapters, or settings flows that accept API keys.
- Reviewing storage or exposure of OpenRouter/API keys, `ENCRYPTION_MASTER_KEY`, auth secrets, session secrets, presigned URLs, or object keys.
- Adding secret rotation, new providers, credential labels, credential defaults, or audit logs.

## Repo Context

- Model credentials are encrypted with AES-256-GCM and a key version.
- Workspace owners manage model credentials.
- A global `OPENROUTER_API_KEY` may be used when no workspace default credential exists.
- Audit logs and UI pages must never reveal raw secrets.

## Workflow

1. Inventory secret sources: forms, environment variables, database fields, provider adapters, logs, thrown errors, tests, and rendered UI.
2. Trace secret lifecycle: input → validation → encryption → storage → decryption → provider call → revocation/deletion.
3. Verify authorization before saving, listing, selecting default, decrypting, revoking, or using a credential.
4. Review cryptography parameters and key material handling.
5. Check logs, audit metadata, errors, and test snapshots for secret leakage.
6. Check rotation and revocation semantics: revoked credentials are not listed, selected, decrypted, or used.
7. Add tests that prove secrets are encrypted at rest and absent from UI/API/audit outputs.

## Required Checks

### Secret boundaries

- Raw API keys and master keys must never be returned to clients, logged, written to audit metadata, included in model context, or stored in plaintext.
- Environment variables must only be read in server-only modules.
- `NEXT_PUBLIC_` variables are public and must never contain secrets.
- Error messages should name the missing configuration, not include the secret value.

### Encryption

- AES-GCM nonce must be unique per encryption and 12 bytes is appropriate.
- Master key must decode to exactly 32 bytes for AES-256-GCM.
- Store authentication tag with ciphertext and verify during decryption.
- Keep `secretKeyVersion` explicit. New key versions need migration/read support, not silent fallback.
- Do not reuse encrypted payloads across credentials or workspaces.

### Credential lifecycle

- Saving credentials requires OWNER access.
- Listing credentials returns metadata only: id, provider, label, default flag, timestamps, revoked state if needed; never encrypted payload fields in UI DTOs.
- Default credential selection must be transactional so one active default exists per workspace/provider.
- Revoked credentials must not be selected by default lookup.
- Credential labels are not secrets but still user-controlled; escape in UI and logs.

### Provider use

- Decrypt only immediately before a provider call and keep plaintext in the smallest possible scope.
- Do not cache plaintext keys globally.
- Do not include Authorization headers in thrown errors or debug logs.
- Sanitize provider errors before returning them to route handlers or UI.

## Improvement Defaults

- Create DTO mappers for credential list responses instead of returning Prisma records.
- Keep encryption helpers pure and covered by unit tests.
- Prefer explicit `revokedAt: null` filters everywhere active credentials are read.
- Add audit logs with provider, credential id, label, and default flag only.

## Verification

- Run encryption tests after crypto changes: `npm run test -- src/server/security/encryption.test.ts`.
- Run credential/model tests if present or add focused tests for save/list/revoke/default behavior.
- Run lint after route/action/UI changes.

## Sources

- OWASP secrets management cheat sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- Node.js crypto API docs: https://nodejs.org/api/crypto.html
