import type { PublishCarouselRequest } from "./linkedin-publisher-state"

export interface LinkedInConnection {
  connected: boolean
  displayName?: string
  expiresAt?: number
  reconnectRequired: boolean
}

export interface LinkedInPublishResult {
  postUrn: string
  postUrl: string
  publishedAt: string
}

export type LinkedInPublishStatus =
  | { state: "idle" }
  | { state: "in_progress" }
  | { state: "retry_safe" }
  | { state: "unknown" }
  | { state: "published"; postUrl: string; publishedAt: string }

export interface LinkedInPublisherPreflightPage {
  index: 1 | 2 | 3 | 4 | 5
  altText: string
  mimeType: "image/png" | "image/jpeg"
  checksum: string
  previewUrl: string
}

export interface LinkedInPublisherPreflight {
  runId: string
  revision: number
  artifactChecksum: string
  documentTitle: string
  caption: string
  pages: LinkedInPublisherPreflightPage[]
}

export type LinkedInPublisherErrorCode =
  | "AUTH_REQUIRED"
  | "INSUFFICIENT_SCOPE"
  | "STALE_REVISION"
  | "DUPLICATE_PUBLISH"
  | "UNKNOWN_OUTCOME"
  | "INVALID_ARTIFACT"
  | "INVALID_UPSTREAM_RESPONSE"
  | "RATE_LIMITED"
  | "LINKEDIN_UNAVAILABLE"
  | "CONFIGURATION_ERROR"

export class LinkedInPublisherApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: LinkedInPublisherErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = "LinkedInPublisherApiError"
  }
}

export type PublisherFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function getLinkedInConnection(
  fetch: PublisherFetch = globalThis.fetch,
): Promise<LinkedInConnection> {
  const response = await fetch("/api/linkedin/connection", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
  const body = await safeJson(response)

  if (!response.ok) {
    throw toApiError(response.status, body)
  }

  return parseConnection(body)
}

export async function getLinkedInPublisherPreflight(
  runId: string,
  revision: number,
  fetch: PublisherFetch = globalThis.fetch,
): Promise<LinkedInPublisherPreflight> {
  const query = new URLSearchParams({ runId, revision: String(revision) })
  const response = await fetch(`/api/linkedin/preflight?${query}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
  const body = await safeJson(response)
  if (!response.ok) throw toApiError(response.status, body)
  return parsePreflight(body, runId, revision, response.status)
}

export async function getLinkedInPublishStatus(
  runId: string,
  revision: number,
  fetch: PublisherFetch = globalThis.fetch,
): Promise<LinkedInPublishStatus> {
  const query = new URLSearchParams({ runId, revision: String(revision) })
  const response = await fetch(`/api/linkedin/publish/status?${query}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
  const body = await safeJson(response)
  if (!response.ok) throw toApiError(response.status, body)
  return parsePublishStatus(body, response.status)
}

export async function publishCarousel(
  request: PublishCarouselRequest,
  fetch: PublisherFetch = globalThis.fetch,
): Promise<LinkedInPublishResult> {
  const response = await fetch("/api/linkedin/publish", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  })
  const body = await safeJson(response)

  if (!response.ok) {
    throw toApiError(response.status, body)
  }

  if (!isRecord(body)
    || typeof body.postUrn !== "string"
    || typeof body.postUrl !== "string"
    || typeof body.publishedAt !== "string") {
    throw new LinkedInPublisherApiError(
      response.status,
      "INVALID_UPSTREAM_RESPONSE",
      "LinkedIn returned an unexpected publishing response.",
    )
  }

  return {
    postUrn: body.postUrn,
    postUrl: body.postUrl,
    publishedAt: body.publishedAt,
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function parseConnection(body: unknown): LinkedInConnection {
  if (!isRecord(body) || typeof body.connected !== "boolean") {
    return { connected: false, reconnectRequired: true }
  }

  return {
    connected: body.connected,
    ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
    ...(typeof body.expiresAt === "number" ? { expiresAt: body.expiresAt } : {}),
    reconnectRequired: body.reconnectRequired === true,
  }
}

function parsePreflight(
  body: unknown,
  requestedRunId: string,
  requestedRevision: number,
  status: number,
): LinkedInPublisherPreflight {
  if (!isRecord(body)
    || !hasExactKeys(body, [
      "runId",
      "revision",
      "artifactChecksum",
      "documentTitle",
      "caption",
      "pages",
    ])
    || body.runId !== requestedRunId
    || body.revision !== requestedRevision
    || !isSha256(body.artifactChecksum)
    || typeof body.documentTitle !== "string"
    || body.documentTitle.trim().length === 0
    || typeof body.caption !== "string"
    || body.caption.trim().length === 0
    || !Array.isArray(body.pages)
    || body.pages.length !== 5) {
    throw invalidPreflight(status)
  }

  const pages = body.pages.map((page, offset) => parsePreflightPage(
    page,
    offset + 1,
    requestedRunId,
    requestedRevision,
    status,
  ))
  return {
    runId: body.runId,
    revision: body.revision,
    artifactChecksum: body.artifactChecksum,
    documentTitle: body.documentTitle,
    caption: body.caption,
    pages,
  }
}

function parsePublishStatus(body: unknown, status: number): LinkedInPublishStatus {
  if (!isRecord(body) || typeof body.state !== "string") throw invalidStatus(status)
  if (body.state === "idle"
    || body.state === "in_progress"
    || body.state === "retry_safe"
    || body.state === "unknown") {
    if (!hasExactKeys(body, ["state"])) throw invalidStatus(status)
    return { state: body.state }
  }
  if (body.state !== "published"
    || !hasExactKeys(body, ["state", "postUrl", "publishedAt"])
    || typeof body.postUrl !== "string"
    || !isSafeLinkedInPostUrl(body.postUrl)
    || typeof body.publishedAt !== "string"
    || !Number.isFinite(Date.parse(body.publishedAt))) {
    throw invalidStatus(status)
  }
  return {
    state: "published",
    postUrl: body.postUrl,
    publishedAt: body.publishedAt,
  }
}

function parsePreflightPage(
  value: unknown,
  expectedIndex: number,
  runId: string,
  revision: number,
  status: number,
): LinkedInPublisherPreflightPage {
  if (!isRecord(value)
    || !hasExactKeys(value, ["index", "altText", "mimeType", "checksum", "previewUrl"])
    || value.index !== expectedIndex
    || typeof value.altText !== "string"
    || value.altText.trim().length === 0
    || (value.mimeType !== "image/png" && value.mimeType !== "image/jpeg")
    || !isSha256(value.checksum)
    || typeof value.previewUrl !== "string"
    || !isSafePreviewUrl(value.previewUrl, runId, revision, expectedIndex, value.checksum)) {
    throw invalidPreflight(status)
  }
  return value as unknown as LinkedInPublisherPreflightPage
}

function isSafePreviewUrl(
  value: string,
  runId: string,
  revision: number,
  index: number,
  checksum: string,
): boolean {
  if (!value.startsWith("/api/linkedin/preflight/preview?")) return false
  const url = new URL(value, "http://dashboard.local")
  if (url.origin !== "http://dashboard.local"
    || url.pathname !== "/api/linkedin/preflight/preview"
    || [...url.searchParams.keys()].sort().join(",") !== "checksum,index,revision,runId") return false
  return url.searchParams.get("runId") === runId
    && url.searchParams.get("revision") === String(revision)
    && url.searchParams.get("index") === String(index)
    && url.searchParams.get("checksum") === checksum
}

function invalidPreflight(status: number): LinkedInPublisherApiError {
  return new LinkedInPublisherApiError(
    status,
    "INVALID_UPSTREAM_RESPONSE",
    "The approved carousel preflight response was invalid.",
  )
}

function invalidStatus(status: number): LinkedInPublisherApiError {
  return new LinkedInPublisherApiError(
    status,
    "INVALID_UPSTREAM_RESPONSE",
    "The LinkedIn publish status response was invalid.",
  )
}

function isSafeLinkedInPostUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:"
      && url.hostname === "www.linkedin.com"
      && url.username === ""
      && url.password === ""
      && url.port === ""
      && url.pathname.startsWith("/feed/update/")
      && url.search === ""
      && url.hash === ""
  } catch {
    return false
  }
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",")
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function toApiError(status: number, body: unknown): LinkedInPublisherApiError {
  if (isRecord(body) && isRecord(body.error)
    && isErrorCode(body.error.code) && typeof body.error.message === "string") {
    return new LinkedInPublisherApiError(
      status,
      body.error.code,
      body.error.message,
      typeof body.error.retryAfterSeconds === "number" ? body.error.retryAfterSeconds : undefined,
    )
  }

  return new LinkedInPublisherApiError(
    status,
    "LINKEDIN_UNAVAILABLE",
    "LinkedIn publishing is temporarily unavailable.",
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isErrorCode(value: unknown): value is LinkedInPublisherErrorCode {
  return value === "AUTH_REQUIRED"
    || value === "INSUFFICIENT_SCOPE"
    || value === "STALE_REVISION"
    || value === "DUPLICATE_PUBLISH"
    || value === "UNKNOWN_OUTCOME"
    || value === "INVALID_ARTIFACT"
    || value === "INVALID_UPSTREAM_RESPONSE"
    || value === "RATE_LIMITED"
    || value === "LINKEDIN_UNAVAILABLE"
    || value === "CONFIGURATION_ERROR"
}
