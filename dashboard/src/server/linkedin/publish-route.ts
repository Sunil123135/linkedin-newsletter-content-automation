import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import { FileSystemCarouselArtifactStore } from "@/server/carousel-artifacts/artifact-store"
import { parseLinkedInConfig, type LinkedInConfig } from "@/server/linkedin/config"
import {
  NextLinkedInCredentialStore,
  type LinkedInCredential,
} from "@/server/linkedin/credential-store"
import { LinkedInError, type LinkedInErrorCode } from "@/server/linkedin/errors"
import { LinkedInClient } from "@/server/linkedin/linkedin-client"
import { buildCarouselPdf } from "@/server/linkedin/pdf-builder"
import { FileSystemPublishAttemptStore } from "@/server/linkedin/publish-attempt-store"
import { ApprovedCarouselPublisher } from "@/server/linkedin/publisher"

const publishRequestSchema = z.object({
  runId: z.string().min(1).max(128),
  revision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict()

interface PublishRouteDependencies {
  loadConfig(): LinkedInConfig
  loadCredential(request: NextRequest, config: LinkedInConfig): LinkedInCredential | undefined
  createPublisher(config: LinkedInConfig): ApprovedCarouselPublisher
}

export function createDefaultPublishRoute() {
  return createPublishRoute({
    loadConfig: () => parseLinkedInConfig(),
    loadCredential: (request, config) => new NextLinkedInCredentialStore(
      request.cookies,
      config.sessionSecret,
    ).load(),
    createPublisher: (config) => new ApprovedCarouselPublisher({
      artifactStore: new FileSystemCarouselArtifactStore(),
      attemptStore: new FileSystemPublishAttemptStore(),
      buildPdf: buildCarouselPdf,
      createClient: (credential) => new LinkedInClient({
        accessToken: credential.accessToken,
        apiVersion: config.apiVersion,
        fetch: globalThis.fetch,
      }),
    }),
  })
}

export function createPublishRoute(dependencies: PublishRouteDependencies) {
  return async function publishRoute(request: NextRequest): Promise<NextResponse> {
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return errorResponse(
        new LinkedInError("INVALID_ARTIFACT", "The publish request is invalid."),
      )
    }

    const parsed = publishRequestSchema.safeParse(payload)
    if (!parsed.success) {
      return errorResponse(
        new LinkedInError("INVALID_ARTIFACT", "The publish request is invalid.", parsed.error),
      )
    }

    try {
      const config = dependencies.loadConfig()
      const credential = dependencies.loadCredential(request, config)
      if (!credential) {
        throw new LinkedInError("AUTH_REQUIRED", "Connect LinkedIn before publishing.")
      }

      const result = await dependencies.createPublisher(config).publish({
        ...parsed.data,
        credential,
      })
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      })
    } catch (error) {
      if (error instanceof LinkedInError) return errorResponse(error)
      return errorResponse(new LinkedInError(
        "CONFIGURATION_ERROR",
        "LinkedIn publishing is not configured.",
        error,
      ))
    }
  }
}

function errorResponse(error: LinkedInError): NextResponse {
  const status = statusForCode(error.code)
  const retryAfterSeconds = error.code === "RATE_LIMITED"
    ? error.retryAfterSeconds
    : undefined
  return NextResponse.json({
    error: {
      code: error.code,
      message: error.message,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }),
    },
  })
}

function statusForCode(code: LinkedInErrorCode): number {
  if (code === "AUTH_REQUIRED") return 401
  if (code === "INSUFFICIENT_SCOPE") return 403
  if (code === "STALE_REVISION"
    || code === "DUPLICATE_PUBLISH"
    || code === "UNKNOWN_OUTCOME") return 409
  if (code === "INVALID_ARTIFACT") return 422
  if (code === "RATE_LIMITED") return 429
  if (code === "INVALID_UPSTREAM_RESPONSE") return 502
  return 503
}
