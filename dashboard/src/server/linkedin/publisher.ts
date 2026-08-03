import { createHash } from "node:crypto"
import type {
  CarouselArtifactStore,
  LoadedCarouselSlide,
} from "../carousel-artifacts/artifact-store"
import { ArtifactValidationError } from "../carousel-artifacts/artifact-store"
import type { LinkedInCredential } from "./credential-store"
import { LinkedInError } from "./errors"
import type {
  CreateDocumentPostInput,
  InitializeDocumentInput,
  InitializedDocument,
} from "./linkedin-client"
import type {
  BeginAttemptResult,
  DocumentUploadedPublishAttempt,
  PublishAttemptIdentity,
  PublishAttemptStore,
  StartedPublishAttempt,
} from "./publish-attempt-store"
import { PublishAttemptConflictError } from "./publish-attempt-store"

export interface LinkedInPublishResult {
  postUrn: string
  postUrl: string
  publishedAt: string
}

export interface LinkedInPublisher {
  publishDocument(input: {
    credential: LinkedInCredential
    authorUrn: string
    commentary: string
    documentTitle: string
    pdf: Uint8Array
    idempotencyKey: string
  }): Promise<LinkedInPublishResult>
}

export interface LinkedInDocumentClient {
  initializeDocumentUpload(input: InitializeDocumentInput): Promise<InitializedDocument>
  uploadDocument(uploadUrl: string, pdf: Uint8Array): Promise<void>
  createDocumentPost(input: CreateDocumentPostInput): Promise<{ postUrn: string }>
}

export interface PublishApprovedCarouselInput extends PublishAttemptIdentity {
  credential: LinkedInCredential
}

interface ApprovedCarouselPublisherDependencies {
  attemptStore: PublishAttemptStore
  artifactStore: CarouselArtifactStore
  buildPdf(slides: readonly LoadedCarouselSlide[]): Promise<Uint8Array>
  createClient(credential: LinkedInCredential): LinkedInDocumentClient
  now?: () => Date
}

export class ApprovedCarouselPublisher {
  private readonly now: () => Date

  constructor(private readonly dependencies: ApprovedCarouselPublisherDependencies) {
    this.now = dependencies.now ?? (() => new Date())
  }

  async publish(input: PublishApprovedCarouselInput): Promise<LinkedInPublishResult> {
    const identity = publishIdentity(input)
    let begin: BeginAttemptResult
    try {
      begin = await this.dependencies.attemptStore.begin(identity)
    } catch (error) {
      if (error instanceof PublishAttemptConflictError) {
        throw new LinkedInError(
          "DUPLICATE_PUBLISH",
          "This carousel revision already has a publish attempt.",
          error,
        )
      }
      throw error
    }
    if (begin.kind === "replay") return publishedResult(begin.record)
    if (begin.kind === "duplicate" || begin.kind === "in_progress") {
      throw new LinkedInError(
        "DUPLICATE_PUBLISH",
        "This carousel revision already has a publish attempt.",
      )
    }
    if (begin.kind === "unknown") {
      throw unknownOutcomeError()
    }

    const started = begin.record
    let loaded
    try {
      loaded = await this.dependencies.artifactStore.loadApprovedRun(input.runId, input.revision)
    } catch (error) {
      await this.failSafely(identity, started, error)
      throw classifyArtifactError(error)
    }

    let pdf: Uint8Array
    try {
      pdf = await this.dependencies.buildPdf(loaded.slides)
    } catch (error) {
      await this.failSafely(identity, started, error)
      throw new LinkedInError(
        "INVALID_ARTIFACT",
        "The approved carousel could not be converted into a valid PDF.",
        error,
      )
    }

    const client = this.dependencies.createClient(input.credential)
    let initialized: InitializedDocument
    try {
      initialized = await client.initializeDocumentUpload({ owner: input.credential.authorUrn })
      await client.uploadDocument(initialized.uploadUrl, pdf)
    } catch (error) {
      await this.failSafely(identity, started, error)
      throw error
    }

    const uploaded: DocumentUploadedPublishAttempt = {
      ...identity,
      state: "document_uploaded",
      startedAt: started.startedAt,
      documentUrn: initialized.documentUrn,
      pdfSha256: createHash("sha256").update(pdf).digest("hex"),
    }
    try {
      await this.dependencies.attemptStore.transition(identity, "started", uploaded)
    } catch (error) {
      await this.failSafely(identity, started, error)
      throw error
    }

    let postUrn: string
    try {
      const post = await client.createDocumentPost({
        author: input.credential.authorUrn,
        commentary: loaded.run.caption,
        documentUrn: initialized.documentUrn,
        documentTitle: loaded.run.documentTitle,
      })
      postUrn = post.postUrn
    } catch (error) {
      if (isDefinitivePostRejection(error)) {
        await this.dependencies.attemptStore.transition(identity, "document_uploaded", {
          ...uploaded,
          state: "failed_safe",
          failedAt: this.now().toISOString(),
        })
        throw error
      }

      await this.markUnknown(identity, uploaded, error)
      throw unknownOutcomeError(error)
    }

    const result: LinkedInPublishResult = {
      postUrn,
      postUrl: canonicalPostUrl(postUrn),
      publishedAt: this.now().toISOString(),
    }
    try {
      await this.dependencies.attemptStore.transition(identity, "document_uploaded", {
        ...uploaded,
        state: "published",
        ...result,
      })
    } catch (error) {
      try {
        await this.dependencies.attemptStore.transition(identity, "document_uploaded", {
          ...uploaded,
          state: "unknown",
          failedAt: this.now().toISOString(),
        })
      } catch {
        // The Posts call succeeded but durable state could not be advanced. Never imply a safe retry.
      }
      throw unknownOutcomeError(error)
    }

    return result
  }

  private async failSafely(
    identity: PublishAttemptIdentity,
    started: StartedPublishAttempt,
    cause: unknown,
  ): Promise<void> {
    try {
      await this.dependencies.attemptStore.transition(identity, "started", {
        ...identity,
        state: "failed_safe",
        startedAt: started.startedAt,
        failedAt: this.now().toISOString(),
      })
    } catch (transitionError) {
      throw new LinkedInError(
        "CONFIGURATION_ERROR",
        "Publishing state could not be stored safely.",
        new AggregateError([cause, transitionError]),
      )
    }
  }

  private async markUnknown(
    identity: PublishAttemptIdentity,
    uploaded: DocumentUploadedPublishAttempt,
    cause: unknown,
  ): Promise<void> {
    try {
      await this.dependencies.attemptStore.transition(identity, "document_uploaded", {
        ...uploaded,
        state: "unknown",
        failedAt: this.now().toISOString(),
      })
    } catch (transitionError) {
      throw unknownOutcomeError(new AggregateError([cause, transitionError]))
    }
  }
}

function publishIdentity(input: PublishApprovedCarouselInput): PublishAttemptIdentity {
  return {
    runId: input.runId,
    revision: input.revision,
    idempotencyKey: input.idempotencyKey,
  }
}

function publishedResult(record: {
  postUrn: string
  postUrl: string
  publishedAt: string
}): LinkedInPublishResult {
  return {
    postUrn: record.postUrn,
    postUrl: record.postUrl,
    publishedAt: record.publishedAt,
  }
}

function classifyArtifactError(error: unknown): LinkedInError {
  if (error instanceof ArtifactValidationError && error.code === "STALE_REVISION") {
    return new LinkedInError(
      "STALE_REVISION",
      "The approved carousel revision has changed. Review it again before publishing.",
      error,
    )
  }
  return new LinkedInError(
    "INVALID_ARTIFACT",
    "The approved carousel artifact is unavailable or invalid.",
    error,
  )
}

function canonicalPostUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}`
}

function unknownOutcomeError(cause?: unknown): LinkedInError {
  return new LinkedInError(
    "UNKNOWN_OUTCOME",
    "LinkedIn may have published this post. Check LinkedIn before trying again.",
    cause,
  )
}

function isDefinitivePostRejection(error: unknown): error is LinkedInError {
  return error instanceof LinkedInError && (
    error.code === "AUTH_REQUIRED"
    || error.code === "INSUFFICIENT_SCOPE"
    || error.code === "RATE_LIMITED"
  )
}
