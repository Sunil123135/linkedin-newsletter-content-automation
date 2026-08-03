import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  FileSystemPublishAttemptStore,
  PublishAttemptConflictError,
  type PublishAttemptIdentity,
  type PublishAttemptRecord,
} from "./publish-attempt-store"

const temporaryDirectories: string[] = []
const identity: PublishAttemptIdentity = {
  runId: "run/with unsafe input",
  revision: 3,
  idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe("FileSystemPublishAttemptStore", () => {
  it("creates only one attempt for concurrent calls with the same identity", async () => {
    const store = await createStore()

    const results = await Promise.all([store.begin(identity), store.begin(identity)])

    expect(results.map((result) => result.kind).sort()).toEqual(["begun", "in_progress"])
    await expect(store.get(identity)).resolves.toMatchObject({ ...identity, state: "started" })
  })

  it("allows only one in-progress key for the same run revision", async () => {
    const store = await createStore()
    const otherIdentity = { ...identity, idempotencyKey: "13ef5b1d-fb4c-42c8-8c8a-ef07e5d510f7" }

    const results = await Promise.all([store.begin(identity), store.begin(otherIdentity)])

    expect(results.filter((result) => result.kind === "begun")).toHaveLength(1)
    expect(results.filter((result) => result.kind === "in_progress")).toHaveLength(1)
  })

  it("atomically applies only one transition from an expected state", async () => {
    const store = await createStore()
    const begun = await store.begin(identity)
    expect(begun.kind).toBe("begun")
    const startedAt = begun.record.startedAt
    const documentUploaded = uploadedRecord(startedAt)
    const failedSafe: PublishAttemptRecord = {
      ...identity,
      state: "failed_safe",
      startedAt,
      failedAt: "2026-08-03T10:00:02.000Z",
    }

    const outcomes = await Promise.allSettled([
      store.transition(identity, "started", documentUploaded),
      store.transition(identity, "started", failedSafe),
    ])

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1)
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
      reason: expect.any(PublishAttemptConflictError),
    })
    expect(["document_uploaded", "failed_safe"]).toContain((await store.get(identity))?.state)
  })

  it("replays a published result for the same key and rejects a different key", async () => {
    const store = await createStore()
    const begun = await store.begin(identity)
    const published = publishedRecord(begun.record.startedAt)
    await store.transition(identity, "started", uploadedRecord(begun.record.startedAt))
    await store.transition(identity, "document_uploaded", published)

    await expect(store.begin(identity)).resolves.toEqual({ kind: "replay", record: published })
    await expect(store.begin({
      ...identity,
      idempotencyKey: "13ef5b1d-fb4c-42c8-8c8a-ef07e5d510f7",
    })).resolves.toEqual({ kind: "duplicate", record: published })
  })

  it("does not restart an attempt whose post outcome is unknown", async () => {
    const store = await createStore()
    const begun = await store.begin(identity)
    const uploaded = uploadedRecord(begun.record.startedAt)
    const unknown: PublishAttemptRecord = {
      ...uploaded,
      state: "unknown",
      failedAt: "2026-08-03T10:00:02.000Z",
    }
    await store.transition(identity, "started", uploaded)
    await store.transition(identity, "document_uploaded", unknown)

    await expect(store.begin(identity)).resolves.toEqual({ kind: "unknown", record: unknown })
  })

  it("restarts a failed-safe attempt with the same identity", async () => {
    const store = await createStore()
    const begun = await store.begin(identity)
    await store.transition(identity, "started", {
      ...identity,
      state: "failed_safe",
      startedAt: begun.record.startedAt,
      failedAt: "2026-08-03T10:00:02.000Z",
    })

    const retried = await store.begin(identity)

    expect(retried).toMatchObject({ kind: "begun", record: { ...identity, state: "started" } })
  })

  it("uses hashed filenames and persists no PDF bytes or credentials", async () => {
    const { store, artifactRoot } = await createStoreWithRoot()
    const begun = await store.begin(identity)
    await store.transition(identity, "started", uploadedRecord(begun.record.startedAt))
    const attemptDirectory = path.join(artifactRoot, ".publish-attempts")
    const files = await readdir(attemptDirectory)
    const recordFile = files.find((file) => file.endsWith(".json"))
    if (!recordFile) throw new Error("Expected an attempt record")

    const contents = await readFile(path.join(attemptDirectory, recordFile), "utf8")

    expect(recordFile).toMatch(/^[a-f0-9]{64}\.json$/)
    expect(recordFile).not.toContain(identity.runId)
    expect(contents).toContain('"pdfSha256"')
    expect(contents).not.toContain("access-token")
    expect(contents).not.toContain("%PDF")
  })
})

async function createStore() {
  return (await createStoreWithRoot()).store
}

async function createStoreWithRoot() {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "publish-attempt-store-"))
  temporaryDirectories.push(artifactRoot)
  return {
    artifactRoot,
    store: new FileSystemPublishAttemptStore(
      artifactRoot,
      () => new Date("2026-08-03T10:00:00.000Z"),
    ),
  }
}

function uploadedRecord(
  startedAt: string,
): Extract<PublishAttemptRecord, { state: "document_uploaded" }> {
  return {
    ...identity,
    state: "document_uploaded",
    startedAt,
    documentUrn: "urn:li:document:document-456",
    pdfSha256: "a".repeat(64),
  }
}

function publishedRecord(
  startedAt: string,
): Extract<PublishAttemptRecord, { state: "published" }> {
  return {
    ...uploadedRecord(startedAt),
    state: "published",
    postUrn: "urn:li:share:post-789",
    postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
    publishedAt: "2026-08-03T10:00:01.000Z",
  }
}
