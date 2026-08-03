import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

import type { LinkedInConfig } from "./config"
import type { LinkedInCredential } from "./credential-store"
import {
  createDefaultPublishStatusRoute,
  createPublishStatusRoute,
} from "./publish-status-route"

const config = {} as LinkedInConfig
const credential = { displayName: "Ada Lovelace" } as LinkedInCredential

describe("GET LinkedIn publish status", () => {
  it("keeps default filesystem composition lazy until request handling", () => {
    const previousRoot = process.env.CAROUSEL_ARTIFACT_ROOT
    delete process.env.CAROUSEL_ARTIFACT_ROOT
    try {
      expect(() => createDefaultPublishStatusRoute()).not.toThrow()
    } finally {
      if (previousRoot === undefined) delete process.env.CAROUSEL_ARTIFACT_ROOT
      else process.env.CAROUSEL_ARTIFACT_ROOT = previousRoot
    }
  })

  it("requires a valid encrypted credential before reading attempt records", async () => {
    const getStatus = vi.fn()
    const route = createPublishStatusRoute({
      loadConfig: () => config,
      loadCredential: () => undefined,
      getStatus,
    })

    const response = await route(request("?runId=run-123&revision=3"))

    expect(response.status).toBe(401)
    expect(getStatus).not.toHaveBeenCalled()
  })

  it.each([
    { state: "idle" },
    { state: "in_progress" },
    { state: "retry_safe" },
    { state: "unknown" },
    {
      state: "published",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
      publishedAt: "2026-08-03T10:00:01.000Z",
    },
  ] as const)("returns the safe reconciled $state status", async (status) => {
    const route = createPublishStatusRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      getStatus: async () => status,
    })

    const response = await route(request("?runId=run-123&revision=3"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(status)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(body)).not.toMatch(/idempotencyKey|postUrn|documentUrn|pdfSha256|accessToken/)
  })

  it("rejects malformed scope without consulting storage", async () => {
    const getStatus = vi.fn()
    const route = createPublishStatusRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      getStatus,
    })

    const response = await route(request("?runId=run-123&revision=0"))

    expect(response.status).toBe(422)
    expect(getStatus).not.toHaveBeenCalled()
  })

  it("fails closed instead of exposing a corrupted attempt record", async () => {
    const route = createPublishStatusRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      getStatus: async () => ({
        state: "published",
        postUrl: "https://www.linkedin.com.evil.example/feed/update/post-789",
        publishedAt: "2026-08-03T10:00:01.000Z",
        documentUrn: "urn:li:document:sensitive",
      } as never),
    })

    const response = await route(request("?runId=run-123&revision=3"))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "LinkedIn publish status is not configured.",
      },
    })
    expect(JSON.stringify(body)).not.toContain("document:sensitive")
    expect(JSON.stringify(body)).not.toContain("linkedin.com.evil.example")
  })
})

function request(search: string): NextRequest {
  return new NextRequest(`http://localhost:3100/api/linkedin/publish/status${search}`)
}
