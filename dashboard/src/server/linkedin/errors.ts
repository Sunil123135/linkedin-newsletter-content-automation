export type LinkedInErrorCode =
  | "AUTH_REQUIRED"
  | "INSUFFICIENT_SCOPE"
  | "STALE_REVISION"
  | "DUPLICATE_PUBLISH"
  | "UNKNOWN_OUTCOME"
  | "INVALID_ARTIFACT"
  | "RATE_LIMITED"
  | "LINKEDIN_UNAVAILABLE"
  | "CONFIGURATION_ERROR"

export class LinkedInError extends Error {
  readonly code: LinkedInErrorCode
  readonly retryAfterSeconds?: number

  constructor(
    code: LinkedInErrorCode,
    publicMessage: string,
    cause?: unknown,
    metadata?: { retryAfterSeconds?: number },
  ) {
    super(publicMessage, { cause })
    this.name = "LinkedInError"
    this.code = code
    if (metadata?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = metadata.retryAfterSeconds
    }
  }
}
