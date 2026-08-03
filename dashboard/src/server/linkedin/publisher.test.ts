import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  ArtifactValidationError,
  type CarouselArtifactStore,
  type LoadedApprovedCarouselRun,
} from "../carousel-artifacts/artifact-store"
import type { LinkedInCredential } from "./credential-store"
import { LinkedInError } from "./errors"
import type {
  BeginAttemptResult,
  PublishAttemptIdentity,
  PublishAttemptRecord,
  PublishAttemptState,
  PublishAttemptStore,
} from "./publish-attempt-store"
import { PublishAttemptConflictError } from "./publish-attempt-store"
import {
  ApprovedCarouselPublisher,
  type LinkedInDocumentClient,
  type LinkedInPublishResult,
} from "./publisher"

const identity: PublishAttemptIdentity = {
  runId: "run-123",
  revision: 3,
  idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
}
const credential: LinkedInCredential = {
  accessToken: "secret-access-token",
  expiresAt: 1_900_000_000_000,
  subject: "member-123",
  authorUrn: "urn:li:person:member-123",
  displayName: "Ada Lovelace",
}
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])
const documentUrn = "urn:li:document:document-456"
const postUrn = "urn:li:share:post-789"
const postUrl = `https://www.linkedin.com/feed/update/${postUrn}`
const publishedAt = "2026-08-03T10:00:01.000Z"

describe("ApprovedCarouselPublisher", () => {
  it("loads the approved revision, builds the PDF, uploads it, and creates one post", async () => {
    const fixture = createFixture()

    const result = await fixture.publisher.publish({ ...identity, credential })

    expect(result).toEqual({ postUrn, postUrl, publishedAt })
    expect(fixture.events).toEqual([
      "begin:run-123:3",
      "load:run-123:3",
      "build:5",
      "client:secret-access-token",
      "initialize:urn:li:person:member-123",
      "upload:https://uploads.linkedin.test/document",
      "transition:started->document_uploaded",
      "post:urn:li:person:member-123:urn:li:document:document-456",
      "transition:document_uploaded->published",
    ])
  })

  it("returns the saved result without artifact, PDF, or network work for the same published key", async () => {
    const saved = publishedRecord()
    const fixture = createFixture({ begin: { kind: "replay", record: saved } })

    await expect(fixture.publisher.publish({ ...identity, credential })).resolves.toEqual({
      postUrn,
      postUrl,
      publishedAt,
    })
    expect(fixture.events).toEqual(["begin:run-123:3"])
  })

  it("rejects the same run and revision with a different completed key", async () => {
    const fixture = createFixture({ begin: { kind: "duplicate", record: publishedRecord() } })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "DUPLICATE_PUBLISH",
    } satisfies Partial<LinkedInError>)
    expect(fixture.events).toEqual(["begin:run-123:3"])
  })

  it("rejects a concurrent in-progress attempt", async () => {
    const fixture = createFixture({
      begin: { kind: "in_progress", record: startedRecord() },
    })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "DUPLICATE_PUBLISH",
    } satisfies Partial<LinkedInError>)
    expect(fixture.events).toEqual(["begin:run-123:3"])
  })

  it("classifies an active filesystem begin lock as a concurrent attempt", async () => {
    const fixture = createFixture({
      beginError: new PublishAttemptConflictError("locked"),
    })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "DUPLICATE_PUBLISH",
    } satisfies Partial<LinkedInError>)
    expect(fixture.events).toEqual(["begin:run-123:3"])
  })

  it("rejects a stale revision before PDF or LinkedIn calls", async () => {
    const fixture = createFixture({
      artifactError: new ArtifactValidationError("STALE_REVISION", "stale"),
    })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "STALE_REVISION",
    } satisfies Partial<LinkedInError>)
    expect(fixture.events).toEqual([
      "begin:run-123:3",
      "load:run-123:3",
      "transition:started->failed_safe",
    ])
  })

  it("records the document URN and PDF checksum before creating the post", async () => {
    const fixture = createFixture()

    await fixture.publisher.publish({ ...identity, credential })

    const uploaded = fixture.transitions[0]?.next
    expect(uploaded).toEqual({
      ...identity,
      state: "document_uploaded",
      startedAt: "2026-08-03T10:00:00.000Z",
      documentUrn,
      pdfSha256: createHash("sha256").update(pdf).digest("hex"),
    })
    expect(fixture.events.indexOf("transition:started->document_uploaded"))
      .toBeLessThan(fixture.events.indexOf(`post:${credential.authorUrn}:${documentUrn}`))
  })

  it("records unknown when post creation has an ambiguous network failure", async () => {
    const fixture = createFixture({
      postError: new LinkedInError("UNKNOWN_OUTCOME", "ambiguous", new TypeError("socket closed")),
    })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "UNKNOWN_OUTCOME",
    } satisfies Partial<LinkedInError>)
    expect(fixture.transitions.at(-1)).toMatchObject({
      expected: "document_uploaded",
      next: {
        state: "unknown",
        documentUrn,
        pdfSha256: createHash("sha256").update(pdf).digest("hex"),
      },
    })
  })

  it("records unknown when LinkedIn accepts a post without returning its URN", async () => {
    const fixture = createFixture({
      postError: new LinkedInError("INVALID_UPSTREAM_RESPONSE", "invalid response"),
    })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "INVALID_UPSTREAM_RESPONSE",
    } satisfies Partial<LinkedInError>)
    expect(fixture.transitions.at(-1)).toMatchObject({
      expected: "document_uploaded",
      next: { state: "unknown", documentUrn },
    })
  })

  it("retains uploaded-document evidence after a safely rejected post", async () => {
    const fixture = createFixture({
      postError: new LinkedInError("RATE_LIMITED", "retry later"),
    })

    await expect(fixture.publisher.publish({ ...identity, credential })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    } satisfies Partial<LinkedInError>)
    expect(fixture.transitions.at(-1)).toMatchObject({
      expected: "document_uploaded",
      next: {
        state: "failed_safe",
        documentUrn,
        pdfSha256: createHash("sha256").update(pdf).digest("hex"),
      },
    })
  })

  it("allows a retry after failed_safe without duplicating a published result", async () => {
    const fixture = createFixture({ begin: { kind: "begun", record: startedRecord() } })

    await expect(fixture.publisher.publish({ ...identity, credential })).resolves.toEqual({
      postUrn,
      postUrl,
      publishedAt,
    })
    expect(fixture.events.filter((event) => event.startsWith("post:"))).toHaveLength(1)
  })
})

interface FixtureOptions {
  begin?: BeginAttemptResult
  beginError?: Error
  artifactError?: Error
  postError?: Error
}

function createFixture(options: FixtureOptions = {}) {
  const events: string[] = []
  const transitions: Array<{
    expected: PublishAttemptState
    next: PublishAttemptRecord
  }> = []
  const attemptStore: PublishAttemptStore = {
    async begin(input) {
      events.push(`begin:${input.runId}:${input.revision}`)
      if (options.beginError) throw options.beginError
      return options.begin ?? { kind: "begun", record: startedRecord() }
    },
    async transition(_attemptIdentity, expected, next) {
      events.push(`transition:${expected}->${next.state}`)
      transitions.push({ expected, next })
    },
    async get() {
      return null
    },
  }
  const artifactStore: CarouselArtifactStore = {
    async loadApprovedRun(runId, revision) {
      events.push(`load:${runId}:${revision}`)
      if (options.artifactError) throw options.artifactError
      return approvedRun()
    },
  }
  const client: LinkedInDocumentClient = {
    async initializeDocumentUpload({ owner }) {
      events.push(`initialize:${owner}`)
      return { documentUrn, uploadUrl: "https://uploads.linkedin.test/document" }
    },
    async uploadDocument(uploadUrl, uploadedPdf) {
      if (uploadedPdf !== pdf) throw new Error("Publisher did not pass the generated PDF")
      events.push(`upload:${uploadUrl}`)
    },
    async createDocumentPost(input) {
      events.push(`post:${input.author}:${input.documentUrn}`)
      if (options.postError) throw options.postError
      return { postUrn }
    },
  }
  const publisher = new ApprovedCarouselPublisher({
    attemptStore,
    artifactStore,
    async buildPdf(slides) {
      events.push(`build:${slides.length}`)
      return pdf
    },
    createClient(receivedCredential) {
      events.push(`client:${receivedCredential.accessToken}`)
      return client
    },
    now: () => new Date(publishedAt),
  })

  return { events, publisher, transitions }
}

function approvedRun(): LoadedApprovedCarouselRun {
  return {
    run: {
      id: identity.runId,
      revision: identity.revision,
      status: "approved",
      caption: "Practical ways to build better systems.",
      documentTitle: "Engineering field notes",
      slides: [1, 2, 3, 4, 5].map((index) => ({
        id: `slide-${index}`,
        index: index as 1 | 2 | 3 | 4 | 5,
        storageKey: `${identity.runId}/slides/0${index}.png`,
        mimeType: "image/png" as const,
        width: 1080 as const,
        height: 1080 as const,
        altText: `Slide ${index}`,
        checksum: `${index}`.repeat(64),
      })),
    },
    slides: [1, 2, 3, 4, 5].map((index) => ({
      asset: {
        id: `slide-${index}`,
        index: index as 1 | 2 | 3 | 4 | 5,
        storageKey: `${identity.runId}/slides/0${index}.png`,
        mimeType: "image/png" as const,
        width: 1080 as const,
        height: 1080 as const,
        altText: `Slide ${index}`,
        checksum: `${index}`.repeat(64),
      },
      bytes: new Uint8Array([index]),
    })),
  }
}

function startedRecord(): Extract<PublishAttemptRecord, { state: "started" }> {
  return {
    ...identity,
    state: "started",
    startedAt: "2026-08-03T10:00:00.000Z",
  }
}

function publishedRecord(): Extract<PublishAttemptRecord, { state: "published" }> {
  return {
    ...identity,
    state: "published",
    startedAt: "2026-08-03T10:00:00.000Z",
    documentUrn,
    pdfSha256: createHash("sha256").update(pdf).digest("hex"),
    postUrn,
    postUrl,
    publishedAt,
  }
}

const _resultContract: LinkedInPublishResult = { postUrn, postUrl, publishedAt }
void _resultContract
