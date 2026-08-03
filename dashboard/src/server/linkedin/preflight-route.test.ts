import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

import { ArtifactValidationError } from "../carousel-artifacts/artifact-store"
import type { LinkedInConfig } from "./config"
import type { LinkedInCredential } from "./credential-store"
import {
  createDefaultPreflightRoute,
  createDefaultPreviewRoute,
  createPreflightRoute,
  createPreviewRoute,
} from "./preflight-route"

const config = {} as LinkedInConfig
const credential = { displayName: "Ada Lovelace" } as LinkedInCredential

describe("LinkedIn publisher preflight routes", () => {
  it("keeps default route composition lazy until a request reaches the server", () => {
    const previousRoot = process.env.CAROUSEL_ARTIFACT_ROOT
    delete process.env.CAROUSEL_ARTIFACT_ROOT
    try {
      expect(() => createDefaultPreflightRoute()).not.toThrow()
      expect(() => createDefaultPreviewRoute()).not.toThrow()
    } finally {
      if (previousRoot === undefined) delete process.env.CAROUSEL_ARTIFACT_ROOT
      else process.env.CAROUSEL_ARTIFACT_ROOT = previousRoot
    }
  })

  it("requires the encrypted LinkedIn credential before loading an artifact", async () => {
    const preflight = vi.fn()
    const route = createPreflightRoute({
      loadConfig: () => config,
      loadCredential: () => undefined,
      preflight,
    })

    const response = await route(request("/api/linkedin/preflight?runId=run-123&revision=3"))

    expect(response.status).toBe(401)
    expect(preflight).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: { code: "AUTH_REQUIRED", message: "Connect LinkedIn before validating a carousel." },
    })
  })

  it("returns only the safe preflight contract with no-store caching", async () => {
    const safe = safePreflight()
    const route = createPreflightRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      preflight: async () => safe,
    })

    const response = await route(request("/api/linkedin/preflight?runId=run-123&revision=3"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(safe)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(safe)).not.toMatch(/storageKey|accessToken|authorUrn/i)
  })

  it("maps a stale approved revision to a safe conflict", async () => {
    const route = createPreflightRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      preflight: async () => {
        throw new ArtifactValidationError("STALE_REVISION", "sensitive path")
      },
    })

    const response = await route(request("/api/linkedin/preflight?runId=run-123&revision=4"))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "STALE_REVISION",
        message: "The approved carousel revision has changed.",
      },
    })
  })

  it("serves a revalidated preview with safe response headers", async () => {
    const preview = vi.fn(async () => ({
      bytes: new Uint8Array([137, 80, 78, 71]),
      mimeType: "image/png" as const,
      altText: "Slide 1",
    }))
    const route = createPreviewRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      preview,
    })

    const response = await route(request(
      `/api/linkedin/preflight/preview?runId=run-123&revision=3&index=1&checksum=${"1".repeat(64)}`,
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it("rejects malformed preview identity before reading files", async () => {
    const preview = vi.fn()
    const route = createPreviewRoute({
      loadConfig: () => config,
      loadCredential: () => credential,
      preview,
    })

    const response = await route(request(
      "/api/linkedin/preflight/preview?runId=run-123&revision=3&index=6&checksum=bad",
    ))

    expect(response.status).toBe(422)
    expect(preview).not.toHaveBeenCalled()
  })
})

function request(pathname: string): NextRequest {
  return new NextRequest(`http://localhost:3100${pathname}`)
}

function safePreflight() {
  return {
    runId: "run-123",
    revision: 3,
    artifactChecksum: "a".repeat(64),
    documentTitle: "Server-approved field guide",
    caption: "Five dependable automation lessons.",
    pages: [1, 2, 3, 4, 5].map((index) => ({
      index: index as 1 | 2 | 3 | 4 | 5,
      altText: `Slide ${index}`,
      mimeType: "image/png" as const,
      checksum: String(index).repeat(64),
      previewUrl: `/api/linkedin/preflight/preview?runId=run-123&revision=3&index=${index}&checksum=${String(index).repeat(64)}`,
    })),
  }
}
