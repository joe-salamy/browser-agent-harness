---
name: workspace-file-storage-reviewer
description: Audits and improves workspace file handling, path normalization, versioning, local/S3 object storage, ZIP export, text-file editing, download behavior, checksums, and presigned URL safety in this repo. Use for src/server/workspaces/files.ts, zip.ts, storage adapters, upload/download routes, and tests around files.
license: MIT
metadata:
  author: repo-local
  version: "1.0.0"
  domain: storage
  triggers: file upload, download, s3, object store, workspace files, zip export, path normalization, presigned url, checksum
  role: specialist
  scope: audit-improve
  output-format: findings-and-patch
---

# Workspace File Storage Reviewer

Specialist for file upload, storage, versioning, downloads, text editing, and exports in this repo.

## Use When

- Editing `src/server/workspaces/files.ts`, `src/server/workspaces/zip.ts`, `src/server/storage/**`, or file-related API routes.
- Reviewing path traversal, S3/local storage keys, content type handling, size limits, checksums, ZIP exports, text decoding, or version history.
- Fixing bugs in file create/read/write/download/export flows.

## Repo Context

- Workspace file metadata lives in Prisma models `WorkspaceFile` and `WorkspaceFileVersion`.
- Object bytes live behind `src/server/storage/object-store.ts` implementations.
- File services must enforce workspace access and use normalized workspace paths.
- Current file content is represented by `WorkspaceFile.currentVersionId` and related version rows.
- ZIP export is available through a workspace export route.

## Workflow

1. Trace bytes and metadata separately: request body → normalization → authorization → object key → object store write/read → Prisma metadata/version update → response/export.
2. Verify path normalization before storage or metadata writes. Reject traversal, absolute paths, empty segments, Windows separators, control characters, and ambiguous duplicate paths.
3. Verify object keys are server-generated and scoped. Never use raw user paths as object-store keys without a workspace/version prefix and normalization.
4. Check metadata/bytes atomicity. If bytes write succeeds and DB write fails, or DB write succeeds and bytes write fails, identify cleanup or retry behavior.
5. Check version invariants: monotonic version number per file, current version points to a valid version, previous version chains remain consistent.
6. Review text-file logic: supported content types/extensions, size limits, UTF-8 decode/encode behavior, binary rejection, newline preservation.
7. Review downloads and ZIP export for authorization, names, content type, content disposition, and memory usage.
8. Add tests for path edge cases, cross-workspace access, version increments, and binary/text boundaries.

## Required Checks

### Path safety

- Normalize every submitted path once at the boundary.
- Store canonical paths only; do not compare raw paths later.
- Reject or neutralize `..`, leading slash, drive letters, NUL/control characters, duplicate slashes, and backslashes.
- ZIP entries must use canonical relative paths and must not create zip-slip entries.

### Object storage

- Object keys should include workspace and version identity, not just user filename.
- Checksums should be computed from actual bytes and stored/verified consistently.
- Do not expose internal object keys to clients unless they are explicitly non-sensitive.
- Presigned URLs are bearer tokens: keep expiry short, scope permissions to the object and method, and do not log full URLs.
- Local and S3 implementations must match behavior for missing objects, overwrites, and errors.

### Uploads and downloads

- Enforce size limits before loading unbounded data into memory when possible.
- Treat browser-provided `contentType`, filename, and path as untrusted.
- Set safe `Content-Disposition` filenames; avoid header injection.
- Return 403/404 safely for unauthorized or missing resources.
- Avoid buffering huge exports when streaming is practical; if buffering, document and test expected limits.

### Versioning

- Creating a new version must update current version atomically with version metadata.
- Concurrent writes should not create duplicate version numbers or stale current pointers.
- Soft-deleted files should not be readable, writable, downloadable, or exported unless explicitly restored.

## Improvement Defaults

- Keep path and content-type helpers pure and heavily tested.
- Keep object-store interfaces narrow: `put`, `get`, `delete`, and optional presign operations with exact inputs.
- Prefer one service-layer function per user-visible operation.
- Preserve existing file history rather than overwriting version rows.

## Verification

- Run file service tests: `npm run test -- src/server/workspaces/files.test.ts src/server/workspaces/files.integration.test.ts src/server/workspaces/access.test.ts` when relevant.
- Add tests for every new path normalization or storage invariant.
- Run lint after route or React changes.

## Sources

- Amazon S3 presigned URL guide: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- OWASP file upload cheat sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
