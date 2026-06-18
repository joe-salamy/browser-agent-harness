import { WorkspaceRole } from "@prisma/client";
import type { WorkspaceFile, WorkspaceFileVersion } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  applyHashlineOperations,
  buildHashlineSnapshot,
  createHashlinePreview,
  createHashlineTag,
  firstHashlinePreview,
  hashlineLinesEqual,
  HashlineEditConflictError,
  HashlineStaleSnapshotError,
  joinHashlineText,
  splitHashlineText,
  type HashlineApplyResult,
  type HashlineEditOperation,
  type HashlineSnapshot,
  UnsupportedHashlineFileError,
} from "@/server/agents/hashline-core";
import {
  applyXlsxCellLineOperations,
  isDocxHashlineFile,
  isXlsxHashlineFile,
  readDocxParagraphLines,
  readXlsxCellLines,
  writeDocxParagraphLines,
} from "@/server/agents/hashline-office";
import { getObjectStore } from "@/server/storage";
import { assertWorkspaceAccess } from "@/server/workspaces/access";
import {
  isCoreReadableText,
  writeWorkspaceFileBytes,
  writeWorkspaceTextFile,
} from "@/server/workspaces/files";

export async function readWorkspaceHashlines(input: {
  userId: string;
  workspaceId: string;
  fileId: string;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
}): Promise<HashlineSnapshot> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.VIEWER);
  const file = await getCurrentWorkspaceFile(input.workspaceId, input.fileId);
  const bytes = await getObjectStore().getObject({ key: file.currentVersion.objectKey });
  const adapter = getHashlineAdapter(file.path, file.contentType);
  const lines = await extractHashlineLines(adapter, bytes);
  return buildHashlineSnapshot({
    fileId: file.id,
    path: file.path,
    contentType: file.contentType,
    adapter,
    versionId: file.currentVersion.id,
    sha256: file.currentVersion.sha256,
    lines,
    startLine: input.startLine,
    endLine: input.endLine,
    maxLines: input.maxLines,
  });
}

export async function applyWorkspaceHashlineEdits(input: {
  userId: string;
  workspaceId: string;
  fileId: string;
  tag: string;
  baseVersionId: string;
  baseVersionSha256: string;
  operations: HashlineEditOperation[];
  createdByRunId?: string;
}): Promise<HashlineApplyResult> {
  await assertWorkspaceAccess(input.userId, input.workspaceId, WorkspaceRole.EDITOR);
  const file = await getCurrentWorkspaceFile(input.workspaceId, input.fileId);
  const adapter = getHashlineAdapter(file.path, file.contentType);
  const currentTag = createHashlineTag(file.currentVersion.id, file.currentVersion.sha256);
  if (
    file.currentVersion.id !== input.baseVersionId ||
    file.currentVersion.sha256 !== input.baseVersionSha256 ||
    input.tag !== currentTag
  ) {
    throw new HashlineStaleSnapshotError();
  }

  const bytes = await getObjectStore().getObject({ key: file.currentVersion.objectKey });
  switch (adapter) {
    case "text":
      return applyTextHashlineEdits({ ...input, file, bytes, currentTag });
    case "docx":
      return applyDocxHashlineEdits({ ...input, file, bytes, currentTag });
    case "xlsx":
      return applyXlsxHashlineEdits({ ...input, file, bytes, currentTag });
  }
}

export function isHashlineEditableFile(pathValue: string, contentType: string): boolean {
  return (
    isCoreReadableText(pathValue, contentType) ||
    isDocxHashlineFile(pathValue, contentType) ||
    isXlsxHashlineFile(pathValue, contentType)
  );
}

type CurrentWorkspaceFile = WorkspaceFile & {
  currentVersion: WorkspaceFileVersion;
};

type HashlineAdapter = "text" | "docx" | "xlsx";

type ApplyInput = {
  userId: string;
  workspaceId: string;
  fileId: string;
  operations: HashlineEditOperation[];
  createdByRunId?: string;
  file: CurrentWorkspaceFile;
  bytes: Buffer;
  currentTag: string;
};

async function getCurrentWorkspaceFile(
  workspaceId: string,
  fileId: string,
): Promise<CurrentWorkspaceFile> {
  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, workspaceId, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!file?.currentVersion) throw new Error("File not found.");
  return file as CurrentWorkspaceFile;
}

function getHashlineAdapter(pathValue: string, contentType: string): HashlineAdapter {
  if (isCoreReadableText(pathValue, contentType)) return "text";
  if (isDocxHashlineFile(pathValue, contentType)) return "docx";
  if (isXlsxHashlineFile(pathValue, contentType)) return "xlsx";
  throw new UnsupportedHashlineFileError();
}

async function extractHashlineLines(
  adapter: HashlineAdapter,
  bytes: Buffer,
): Promise<string[]> {
  switch (adapter) {
    case "text":
      return splitHashlineText(bytes.toString("utf8")).lines;
    case "docx":
      return readDocxParagraphLines(bytes);
    case "xlsx":
      return readXlsxCellLines(bytes);
  }
}

async function applyTextHashlineEdits(input: ApplyInput): Promise<HashlineApplyResult> {
  const parsed = splitHashlineText(input.bytes.toString("utf8"));
  const result = applyHashlineOperations(parsed.lines, input.operations);
  if (hashlineLinesEqual(parsed.lines, result.lines)) {
    return {
      versionId: input.file.currentVersion.id,
      versionNumber: input.file.currentVersion.versionNumber,
      tag: input.currentTag,
      preview: firstHashlinePreview({
        path: input.file.path,
        tag: input.currentTag,
        lines: parsed.lines,
      }),
      unchanged: true,
    };
  }
  const text = joinHashlineText(result.lines, parsed.newline, parsed.trailingNewline);
  const version = await writeWorkspaceTextFile({
    userId: input.userId,
    workspaceId: input.workspaceId,
    fileId: input.file.id,
    text,
    contentType: input.file.contentType,
    createdByRunId: input.createdByRunId,
  });
  const nextTag = createHashlineTag(version.id, version.sha256);
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    tag: nextTag,
    preview: createHashlinePreview({
      path: input.file.path,
      tag: nextTag,
      lines: result.lines,
      changedStartLine: result.changedStartLine,
      changedEndLine: result.changedEndLine,
    }),
  };
}

async function applyDocxHashlineEdits(input: ApplyInput): Promise<HashlineApplyResult> {
  const originalLines = await readDocxParagraphLines(input.bytes);
  const result = applyHashlineOperations(originalLines, input.operations);
  if (result.lines.length === 0) {
    throw new HashlineEditConflictError("DOCX must keep at least one paragraph.");
  }
  if (hashlineLinesEqual(originalLines, result.lines)) {
    return {
      versionId: input.file.currentVersion.id,
      versionNumber: input.file.currentVersion.versionNumber,
      tag: input.currentTag,
      preview: firstHashlinePreview({
        path: input.file.path,
        tag: input.currentTag,
        lines: originalLines,
      }),
      unchanged: true,
    };
  }
  const editedBytes = await writeDocxParagraphLines(input.bytes, result.lines);
  const version = await writeWorkspaceFileBytes({
    userId: input.userId,
    workspaceId: input.workspaceId,
    fileId: input.file.id,
    bytes: editedBytes,
    contentType: input.file.contentType,
    createdByRunId: input.createdByRunId,
  });
  const nextTag = createHashlineTag(version.id, version.sha256);
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    tag: nextTag,
    preview: createHashlinePreview({
      path: input.file.path,
      tag: nextTag,
      lines: result.lines,
      changedStartLine: result.changedStartLine,
      changedEndLine: result.changedEndLine,
    }),
  };
}

async function applyXlsxHashlineEdits(input: ApplyInput): Promise<HashlineApplyResult> {
  const originalLines = await readXlsxCellLines(input.bytes);
  const result = await applyXlsxCellLineOperations(input.bytes, input.operations);
  if (hashlineLinesEqual(originalLines, result.lines)) {
    return {
      versionId: input.file.currentVersion.id,
      versionNumber: input.file.currentVersion.versionNumber,
      tag: input.currentTag,
      preview: firstHashlinePreview({
        path: input.file.path,
        tag: input.currentTag,
        lines: originalLines,
      }),
      unchanged: true,
    };
  }
  const version = await writeWorkspaceFileBytes({
    userId: input.userId,
    workspaceId: input.workspaceId,
    fileId: input.file.id,
    bytes: result.bytes,
    contentType: input.file.contentType,
    createdByRunId: input.createdByRunId,
  });
  const nextTag = createHashlineTag(version.id, version.sha256);
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    tag: nextTag,
    preview: createHashlinePreview({
      path: input.file.path,
      tag: nextTag,
      lines: result.lines,
      changedStartLine: result.changedStartLine,
      changedEndLine: result.changedEndLine,
    }),
  };
}
