import { createHash, randomUUID } from "node:crypto"
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises"
import path from "node:path"

export type PublishAttemptState =
  | "started"
  | "document_uploaded"
  | "published"
  | "failed_safe"
  | "unknown"

export interface PublishAttemptIdentity {
  runId: string
  revision: number
  idempotencyKey: string
}

interface PublishAttemptBase extends PublishAttemptIdentity {
  startedAt: string
}

export interface StartedPublishAttempt extends PublishAttemptBase {
  state: "started"
}

export interface DocumentUploadedPublishAttempt extends PublishAttemptBase {
  state: "document_uploaded"
  documentUrn: string
  pdfSha256: string
}

export interface PublishedPublishAttempt extends PublishAttemptBase {
  state: "published"
  documentUrn: string
  pdfSha256: string
  postUrn: string
  postUrl: string
  publishedAt: string
}

export interface FailedSafePublishAttempt extends PublishAttemptBase {
  state: "failed_safe"
  failedAt: string
  documentUrn?: string
  pdfSha256?: string
}

export interface UnknownPublishAttempt extends PublishAttemptBase {
  state: "unknown"
  documentUrn: string
  pdfSha256: string
  failedAt: string
}

export type PublishAttemptRecord =
  | StartedPublishAttempt
  | DocumentUploadedPublishAttempt
  | PublishedPublishAttempt
  | FailedSafePublishAttempt
  | UnknownPublishAttempt

export type BeginAttemptResult =
  | { kind: "begun"; record: StartedPublishAttempt }
  | { kind: "replay"; record: PublishedPublishAttempt }
  | { kind: "duplicate"; record: PublishedPublishAttempt }
  | { kind: "in_progress"; record: StartedPublishAttempt | DocumentUploadedPublishAttempt }
  | { kind: "unknown"; record: UnknownPublishAttempt }

export interface PublishAttemptStore {
  begin(input: PublishAttemptIdentity): Promise<BeginAttemptResult>
  transition(
    identity: PublishAttemptIdentity,
    expected: PublishAttemptState,
    next: PublishAttemptRecord,
  ): Promise<void>
  get(identity: PublishAttemptIdentity): Promise<PublishAttemptRecord | null>
}

export class PublishAttemptConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PublishAttemptConflictError"
  }
}

export class FileSystemPublishAttemptStore implements PublishAttemptStore {
  private readonly attemptDirectory: string

  constructor(
    artifactRoot = process.env.CAROUSEL_ARTIFACT_ROOT,
    private readonly now: () => Date = () => new Date(),
    private readonly syncDirectory: (directory: string) => Promise<void> = syncAttemptDirectory,
  ) {
    if (!artifactRoot) {
      throw new Error("CAROUSEL_ARTIFACT_ROOT must be configured")
    }
    this.attemptDirectory = path.join(path.resolve(artifactRoot), ".publish-attempts")
  }

  async begin(identity: PublishAttemptIdentity): Promise<BeginAttemptResult> {
    await mkdir(this.attemptDirectory, { recursive: true })
    const scopeLock = await this.acquireLock(this.scopeLockPath(identity))
    try {
      const records = await this.readAllRecords()
      const sameScope = records.filter((record) => sameRunRevision(record, identity))
      const existing = sameScope.find((record) => sameIdentity(record, identity))

      const published = sameScope.find(
        (record): record is PublishedPublishAttempt => record.state === "published",
      )
      if (published) {
        return sameIdentity(published, identity)
          ? { kind: "replay", record: published }
          : { kind: "duplicate", record: published }
      }

      const unknown = sameScope.find(
        (record): record is UnknownPublishAttempt => record.state === "unknown",
      )
      if (unknown) return { kind: "unknown", record: unknown }

      const inProgress = sameScope.find(
        (record): record is StartedPublishAttempt | DocumentUploadedPublishAttempt => (
          record.state === "started" || record.state === "document_uploaded"
        ),
      )
      if (inProgress) return { kind: "in_progress", record: inProgress }

      const started: StartedPublishAttempt = {
        ...identity,
        state: "started",
        startedAt: this.now().toISOString(),
      }

      if (existing?.state === "failed_safe") {
        await this.replaceExpected(existing, "failed_safe", started)
      } else {
        await this.createExclusive(this.recordPath(identity), started)
        await this.syncDirectory(this.attemptDirectory)
      }
      return { kind: "begun", record: started }
    } finally {
      await this.releaseLock(scopeLock, this.scopeLockPath(identity))
    }
  }

  async transition(
    identity: PublishAttemptIdentity,
    expected: PublishAttemptState,
    next: PublishAttemptRecord,
  ): Promise<void> {
    if (!sameIdentity(identity, next)) {
      throw new PublishAttemptConflictError("A transition cannot change the attempt identity")
    }
    if (!isAllowedTransition(expected, next.state)) {
      throw new PublishAttemptConflictError(`Invalid publish transition from ${expected} to ${next.state}`)
    }

    const lockPath = this.attemptLockPath(identity)
    const lock = await this.acquireLock(lockPath)
    try {
      await this.replaceExpected(identity, expected, next)
    } finally {
      await this.releaseLock(lock, lockPath)
    }
  }

  async get(identity: PublishAttemptIdentity): Promise<PublishAttemptRecord | null> {
    try {
      return parseRecord(await readFile(this.recordPath(identity), "utf8"))
    } catch (error) {
      if (isFileSystemError(error, "ENOENT")) return null
      throw error
    }
  }

  private async replaceExpected(
    identity: PublishAttemptIdentity,
    expected: PublishAttemptState,
    next: PublishAttemptRecord,
  ): Promise<void> {
    const current = await this.get(identity)
    if (!current || current.state !== expected) {
      throw new PublishAttemptConflictError(
        `Expected publish attempt state ${expected}, found ${current?.state ?? "missing"}`,
      )
    }

    const recordPath = this.recordPath(identity)
    const temporaryPath = `${recordPath}.${process.pid}.${randomUUID()}.tmp`
    let temporaryCreated = false
    try {
      await this.createExclusive(temporaryPath, next)
      temporaryCreated = true
      await atomicReplace(temporaryPath, recordPath)
      temporaryCreated = false
      await this.syncDirectory(this.attemptDirectory)
    } finally {
      if (temporaryCreated) await unlink(temporaryPath).catch(() => undefined)
    }
  }

  private async createExclusive(filePath: string, record: PublishAttemptRecord): Promise<void> {
    let handle: FileHandle | undefined
    try {
      handle = await open(filePath, "wx", 0o600)
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8")
      await handle.sync()
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) {
        throw new PublishAttemptConflictError("The publish attempt already exists")
      }
      throw error
    } finally {
      await handle?.close()
    }
  }

  private async readAllRecords(): Promise<PublishAttemptRecord[]> {
    const files = await readdir(this.attemptDirectory)
    return Promise.all(files
      .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
      .map(async (file) => parseRecord(await readFile(path.join(this.attemptDirectory, file), "utf8"))))
  }

  private async acquireLock(lockPath: string): Promise<FileHandle> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        return await open(lockPath, "wx", 0o600)
      } catch (error) {
        if (!isFileSystemError(error, "EEXIST")) throw error
        await delay(5)
      }
    }
    throw new PublishAttemptConflictError("The publish attempt is currently locked")
  }

  private async releaseLock(handle: FileHandle, lockPath: string): Promise<void> {
    await handle.close()
    await unlink(lockPath).catch(() => undefined)
  }

  private recordPath(identity: PublishAttemptIdentity): string {
    return path.join(this.attemptDirectory, `${identityHash(identity)}.json`)
  }

  private attemptLockPath(identity: PublishAttemptIdentity): string {
    return path.join(this.attemptDirectory, `${identityHash(identity)}.lock`)
  }

  private scopeLockPath(identity: PublishAttemptIdentity): string {
    return path.join(this.attemptDirectory, `${scopeHash(identity)}.scope.lock`)
  }
}

function identityHash(identity: PublishAttemptIdentity): string {
  return createHash("sha256")
    .update(JSON.stringify([identity.runId, identity.revision, identity.idempotencyKey]))
    .digest("hex")
}

function scopeHash(identity: Pick<PublishAttemptIdentity, "runId" | "revision">): string {
  return createHash("sha256")
    .update(JSON.stringify([identity.runId, identity.revision]))
    .digest("hex")
}

function sameRunRevision(
  left: Pick<PublishAttemptIdentity, "runId" | "revision">,
  right: Pick<PublishAttemptIdentity, "runId" | "revision">,
): boolean {
  return left.runId === right.runId && left.revision === right.revision
}

function sameIdentity(
  left: PublishAttemptIdentity,
  right: PublishAttemptIdentity,
): boolean {
  return sameRunRevision(left, right) && left.idempotencyKey === right.idempotencyKey
}

function isAllowedTransition(expected: PublishAttemptState, next: PublishAttemptState): boolean {
  return (expected === "started" && (next === "document_uploaded" || next === "failed_safe"))
    || (expected === "document_uploaded" && (
      next === "published" || next === "failed_safe" || next === "unknown"
    ))
}

function parseRecord(contents: string): PublishAttemptRecord {
  const value: unknown = JSON.parse(contents)
  if (!isRecord(value)
    || typeof value.runId !== "string"
    || !Number.isInteger(value.revision)
    || typeof value.idempotencyKey !== "string"
    || typeof value.startedAt !== "string"
    || !isPublishAttemptState(value.state)) {
    throw new Error("Invalid publish attempt record")
  }

  if (value.state === "started") return value as unknown as StartedPublishAttempt
  if (value.state === "failed_safe") {
    if (typeof value.failedAt !== "string") throw new Error("Invalid failed-safe publish attempt")
    const hasDocumentEvidence = value.documentUrn !== undefined || value.pdfSha256 !== undefined
    if (hasDocumentEvidence && (
      typeof value.documentUrn !== "string"
      || typeof value.pdfSha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(value.pdfSha256)
    )) throw new Error("Invalid failed-safe document evidence")
    return value as unknown as FailedSafePublishAttempt
  }
  if (typeof value.documentUrn !== "string"
    || typeof value.pdfSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(value.pdfSha256)) {
    throw new Error("Invalid uploaded-document publish attempt")
  }
  if (value.state === "document_uploaded") return value as unknown as DocumentUploadedPublishAttempt
  if (value.state === "unknown") {
    if (typeof value.failedAt !== "string") throw new Error("Invalid unknown publish attempt")
    return value as unknown as UnknownPublishAttempt
  }
  if (typeof value.postUrn !== "string"
    || typeof value.postUrl !== "string"
    || typeof value.publishedAt !== "string") {
    throw new Error("Invalid published attempt")
  }
  return value as unknown as PublishedPublishAttempt
}

function isPublishAttemptState(value: unknown): value is PublishAttemptState {
  return value === "started"
    || value === "document_uploaded"
    || value === "published"
    || value === "failed_safe"
    || value === "unknown"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return isRecord(error) && error.code === code
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function atomicReplace(source: string, destination: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const transientWindowsFailure = process.platform === "win32"
        && (isFileSystemError(error, "EPERM") || isFileSystemError(error, "EACCES"))
      if (!transientWindowsFailure || attempt === 99) throw error
      await delay(5)
    }
  }
}

async function syncAttemptDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return

  const handle = await open(directory, "r")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
