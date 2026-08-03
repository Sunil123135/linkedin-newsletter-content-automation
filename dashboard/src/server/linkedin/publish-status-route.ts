import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import { parseLinkedInConfig, type LinkedInConfig } from "./config"
import {
  NextLinkedInCredentialStore,
  type LinkedInCredential,
} from "./credential-store"
import {
  FileSystemPublishAttemptStore,
  type PublishScopeStatus,
} from "./publish-attempt-store"

const publishScopeSchema = z.object({
  runId: z.string().min(1).max(128),
  revision: z.coerce.number().int().positive(),
}).strict()

const publishStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("idle") }).strict(),
  z.object({ state: z.literal("in_progress") }).strict(),
  z.object({ state: z.literal("retry_safe") }).strict(),
  z.object({ state: z.literal("unknown") }).strict(),
  z.object({
    state: z.literal("published"),
    postUrl: z.string().refine(isSafeLinkedInPostUrl),
    publishedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  }).strict(),
])

interface PublishStatusRouteDependencies {
  loadConfig(): LinkedInConfig
  loadCredential(request: NextRequest, config: LinkedInConfig): LinkedInCredential | undefined
  getStatus(runId: string, revision: number): Promise<PublishScopeStatus>
}

export function createDefaultPublishStatusRoute() {
  return createPublishStatusRoute({
    loadConfig: () => parseLinkedInConfig(),
    loadCredential: (request, config) => new NextLinkedInCredentialStore(
      request.cookies,
      config.sessionSecret,
    ).load(),
    getStatus: (runId, revision) => new FileSystemPublishAttemptStore()
      .getScopeStatus({ runId, revision }),
  })
}

export function createPublishStatusRoute(dependencies: PublishStatusRouteDependencies) {
  return async function publishStatusRoute(request: NextRequest): Promise<NextResponse> {
    const parsed = publishScopeSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    )
    if (!parsed.success) {
      return safeError(422, "INVALID_ARTIFACT", "The publish status request is invalid.")
    }

    try {
      const config = dependencies.loadConfig()
      const credential = dependencies.loadCredential(request, config)
      if (!credential) {
        return safeError(401, "AUTH_REQUIRED", "Connect LinkedIn before checking publish status.")
      }

      const status = publishStatusSchema.parse(
        await dependencies.getStatus(parsed.data.runId, parsed.data.revision),
      )
      return NextResponse.json(status, {
        headers: { "Cache-Control": "no-store" },
      })
    } catch {
      return safeError(503, "CONFIGURATION_ERROR", "LinkedIn publish status is not configured.")
    }
  }
}

function safeError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
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
