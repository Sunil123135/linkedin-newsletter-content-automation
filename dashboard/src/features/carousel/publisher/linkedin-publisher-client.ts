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
