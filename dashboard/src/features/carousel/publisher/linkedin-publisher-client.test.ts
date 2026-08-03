import { describe, expect, it, vi } from "vitest"

import {
  LinkedInPublisherApiError,
  getLinkedInConnection,
  getLinkedInPublisherPreflight,
  publishCarousel,
} from "./linkedin-publisher-client"

describe("LinkedIn publisher client", () => {
  it("loads safe connection metadata with same-origin credentials", async () => {
    const fetch = vi.fn(async () => Response.json({
      connected: true,
      displayName: "Ada Lovelace",
      expiresAt: 1_900_000_000_000,
      reconnectRequired: false,
    }))

    await expect(getLinkedInConnection(fetch)).resolves.toEqual({
      connected: true,
      displayName: "Ada Lovelace",
      expiresAt: 1_900_000_000_000,
      reconnectRequired: false,
    })
    expect(fetch).toHaveBeenCalledWith("/api/linkedin/connection", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
  })

  it("loads a run-and-revision-scoped preflight containing only safe review metadata", async () => {
    const fetch = vi.fn(async () => Response.json(preflight))

    await expect(getLinkedInPublisherPreflight("run-123", 3, fetch)).resolves.toEqual(preflight)
    expect(fetch).toHaveBeenCalledWith(
      "/api/linkedin/preflight?runId=run-123&revision=3",
      {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      },
    )
  })

  it("rejects preflight metadata containing an unsafe preview URL or extra manifest fields", async () => {
    const fetch = vi.fn(async () => Response.json({
      ...preflight,
      storageKey: "run-123/slides/01.png",
      pages: [{
        ...preflight.pages[0],
        previewUrl: "https://attacker.example/slide.png",
      }, ...preflight.pages.slice(1)],
    }))

    await expect(getLinkedInPublisherPreflight("run-123", 3, fetch)).rejects.toMatchObject({
      code: "INVALID_UPSTREAM_RESPONSE",
    })
  })

  it.each([
    [401, "AUTH_REQUIRED"],
    [403, "INSUFFICIENT_SCOPE"],
    [409, "STALE_REVISION"],
    [409, "DUPLICATE_PUBLISH"],
    [409, "UNKNOWN_OUTCOME"],
    [422, "INVALID_ARTIFACT"],
    [429, "RATE_LIMITED"],
    [502, "INVALID_UPSTREAM_RESPONSE"],
    [503, "LINKEDIN_UNAVAILABLE"],
    [503, "CONFIGURATION_ERROR"],
  ] as const)("returns a typed %s error for HTTP %i", async (status, code) => {
    const fetch = vi.fn(async () => Response.json({
      error: {
        code,
        message: "A safe public message.",
        ...(code === "RATE_LIMITED" ? { retryAfterSeconds: 60 } : {}),
      },
    }, { status }))

    const promise = publishCarousel({
      runId: "run-123",
      revision: 3,
      artifactChecksum: preflight.artifactChecksum,
      idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
    }, fetch)

    await expect(promise).rejects.toMatchObject({
      name: "LinkedInPublisherApiError",
      status,
      code,
      message: "A safe public message.",
      ...(code === "RATE_LIMITED" ? { retryAfterSeconds: 60 } : {}),
    } satisfies Partial<LinkedInPublisherApiError>)
  })

  it("sends only the approved artifact reference and idempotency key", async () => {
    const fetch = vi.fn(async () => Response.json({
      postUrn: "urn:li:share:post-789",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
      publishedAt: "2026-08-03T10:00:01.000Z",
    }))

    await expect(publishCarousel({
      runId: "run-123",
      revision: 3,
      artifactChecksum: preflight.artifactChecksum,
      idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
    }, fetch)).resolves.toEqual({
      postUrn: "urn:li:share:post-789",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
      publishedAt: "2026-08-03T10:00:01.000Z",
    })
    expect(fetch).toHaveBeenCalledWith("/api/linkedin/publish", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId: "run-123",
        revision: 3,
        artifactChecksum: preflight.artifactChecksum,
        idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
      }),
    })
  })

  it("uses a safe fallback when a route response is not JSON", async () => {
    const fetch = vi.fn(async () => new Response("upstream diagnostics", { status: 503 }))

    await expect(publishCarousel({
      runId: "run-123",
      revision: 3,
      artifactChecksum: preflight.artifactChecksum,
      idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
    }, fetch)).rejects.toMatchObject({
      name: "LinkedInPublisherApiError",
      status: 503,
      code: "LINKEDIN_UNAVAILABLE",
      message: "LinkedIn publishing is temporarily unavailable.",
    } satisfies Partial<LinkedInPublisherApiError>)
  })
})

const preflight = {
  runId: "run-123",
  revision: 3,
  artifactChecksum: "a".repeat(64),
  documentTitle: "AI systems that recover safely",
  caption: "Five field-tested lessons for dependable agents.",
  pages: [1, 2, 3, 4, 5].map((index) => ({
    index,
    altText: `Slide ${index}`,
    mimeType: "image/png" as const,
    checksum: String(index).repeat(64),
    previewUrl: `/api/linkedin/preflight/preview?runId=run-123&revision=3&index=${index}&checksum=${String(index).repeat(64)}`,
  })),
}
