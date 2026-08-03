import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import { FileSystemCarouselArtifactStore } from "../carousel-artifacts/artifact-store"
import { ArtifactValidationError } from "../carousel-artifacts/artifact-store"
import { parseLinkedInConfig, type LinkedInConfig } from "./config"
import {
  NextLinkedInCredentialStore,
  type LinkedInCredential,
} from "./credential-store"
import { LinkedInError } from "./errors"
import {
  loadCarouselPreview,
  preflightApprovedCarousel,
  type SafeCarouselPreflight,
} from "./preflight"

const identitySchema = z.object({
  runId: z.string().min(1).max(128),
  revision: z.coerce.number().int().positive(),
}).strict()

const previewIdentitySchema = identitySchema.extend({
  index: z.coerce.number().int().min(1).max(5),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

interface CommonDependencies {
  loadConfig(): LinkedInConfig
  loadCredential(request: NextRequest, config: LinkedInConfig): LinkedInCredential | undefined
}

interface PreflightRouteDependencies extends CommonDependencies {
  preflight(runId: string, revision: number): Promise<SafeCarouselPreflight>
}

interface PreviewRouteDependencies extends CommonDependencies {
  preview(
    runId: string,
    revision: number,
    index: number,
    checksum: string,
  ): Promise<{ bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; altText: string }>
}

export function createDefaultPreflightRoute() {
  return createPreflightRoute({
    ...defaultCredentialDependencies(),
    preflight: (runId, revision) => preflightApprovedCarousel(
      new FileSystemCarouselArtifactStore(),
      runId,
      revision,
    ),
  })
}

export function createDefaultPreviewRoute() {
  return createPreviewRoute({
    ...defaultCredentialDependencies(),
    preview: (runId, revision, index, checksum) => (
      loadCarouselPreview(
        new FileSystemCarouselArtifactStore(),
        runId,
        revision,
        index,
        checksum,
      )
    ),
  })
}

export function createPreflightRoute(dependencies: PreflightRouteDependencies) {
  return async function preflightRoute(request: NextRequest): Promise<NextResponse> {
    const parsed = parseQuery(request, identitySchema)
    if (!parsed.success) return invalidRequest()

    try {
      requireCredential(request, dependencies)
      const body = await dependencies.preflight(parsed.data.runId, parsed.data.revision)
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
      return preflightError(error)
    }
  }
}

export function createPreviewRoute(dependencies: PreviewRouteDependencies) {
  return async function previewRoute(request: NextRequest): Promise<NextResponse> {
    const parsed = parseQuery(request, previewIdentitySchema)
    if (!parsed.success) return invalidRequest()

    try {
      requireCredential(request, dependencies)
      const preview = await dependencies.preview(
        parsed.data.runId,
        parsed.data.revision,
        parsed.data.index,
        parsed.data.checksum,
      )
      return new NextResponse(preview.bytes as unknown as BodyInit, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": preview.mimeType,
          "X-Content-Type-Options": "nosniff",
        },
      })
    } catch (error) {
      return preflightError(error)
    }
  }
}

function defaultCredentialDependencies(): CommonDependencies {
  return {
    loadConfig: () => parseLinkedInConfig(),
    loadCredential: (request, config) => new NextLinkedInCredentialStore(
      request.cookies,
      config.sessionSecret,
    ).load(),
  }
}

function requireCredential(request: NextRequest, dependencies: CommonDependencies): LinkedInCredential {
  const config = dependencies.loadConfig()
  const credential = dependencies.loadCredential(request, config)
  if (!credential) {
    throw new LinkedInError("AUTH_REQUIRED", "Connect LinkedIn before validating a carousel.")
  }
  return credential
}

function parseQuery<T extends z.ZodType>(request: NextRequest, schema: T) {
  return schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
}

function invalidRequest(): NextResponse {
  return safeError(422, "INVALID_ARTIFACT", "The carousel preflight request is invalid.")
}

function preflightError(error: unknown): NextResponse {
  if (error instanceof LinkedInError && error.code === "AUTH_REQUIRED") {
    return safeError(401, error.code, error.message)
  }
  if (error instanceof ArtifactValidationError && error.code === "STALE_REVISION") {
    return safeError(409, "STALE_REVISION", "The approved carousel revision has changed.")
  }
  if (error instanceof ArtifactValidationError) {
    return safeError(422, "INVALID_ARTIFACT", "The approved carousel artifact is unavailable or invalid.")
  }
  return safeError(503, "CONFIGURATION_ERROR", "Carousel preflight is not configured.")
}

function safeError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}
