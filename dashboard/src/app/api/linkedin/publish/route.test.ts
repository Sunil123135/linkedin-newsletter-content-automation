import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { LinkedInConfig } from "@/server/linkedin/config"
import type { LinkedInCredential } from "@/server/linkedin/credential-store"
import { LinkedInError, type LinkedInErrorCode } from "@/server/linkedin/errors"
import type { ApprovedCarouselPublisher } from "@/server/linkedin/publisher"
import { POST, createPublishRoute } from "./route"

const body = {
  runId: "run-123",
  revision: 3,
  idempotencyKey: "8ec7ccdb-22bc-469b-99c6-7f0fc6d92951",
}
const credential: LinkedInCredential = {
  accessToken: "secret-access-token",
  expiresAt: 1_900_000_000_000,
  subject: "member-123",
  authorUrn: "urn:li:person:member-123",
  displayName: "Ada Lovelace",
}
const config: LinkedInConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3100/api/linkedin/oauth/callback",
  sessionSecret: "a-session-secret-that-is-at-least-32-bytes",
  apiVersion: "202608",
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/linkedin/publish", () => {
  it.each([
    [null],
    [{}],
    [{ ...body, runId: "" }],
    [{ ...body, revision: 0 }],
    [{ ...body, revision: 1.5 }],
    [{ ...body, idempotencyKey: "not-a-uuid" }],
  ])("rejects malformed input before publishing: %j", async (invalidBody) => {
    let publishCalls = 0
    const handler = routeWithPublisher(async () => {
      publishCalls += 1
      throw new Error("Should not publish invalid input")
    })

    const response = await handler(request(invalidBody))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_ARTIFACT",
        message: "The publish request is invalid.",
      },
    })
    expect(publishCalls).toBe(0)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it.each([
    ["accessToken", "attacker-supplied-token"],
    ["authorUrn", "urn:li:person:other-member"],
    ["caption", "Attacker-controlled commentary"],
    ["visibility", "CONNECTIONS"],
    ["files", ["local-file.pdf"]],
    ["storageKey", "../outside.pdf"],
  ])("rejects the forbidden %s field before composition", async (field, value) => {
    let compositionCalls = 0
    const handler = createPublishRoute({
      loadConfig: () => {
        compositionCalls += 1
        return config
      },
      loadCredential: () => credential,
      createPublisher: () => {
        throw new Error("Should not compose an invalid request")
      },
    })

    const response = await handler(request({ ...body, [field]: value }))
    const responseBody = await response.json()

    expect(response.status).toBe(422)
    expect(responseBody).toEqual({
      error: {
        code: "INVALID_ARTIFACT",
        message: "The publish request is invalid.",
      },
    })
    expect(compositionCalls).toBe(0)
    expect(JSON.stringify(responseBody)).not.toContain(String(value))
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("requires a valid encrypted credential", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "configured-client-id")
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "configured-client-secret")
    vi.stubEnv("LINKEDIN_REDIRECT_URI", "http://localhost:3100/api/linkedin/oauth/callback")
    vi.stubEnv("LINKEDIN_SESSION_SECRET", "a-session-secret-that-is-at-least-32-bytes")
    vi.stubEnv("LINKEDIN_API_VERSION", "202608")
    const rawToken = "raw-cookie-access-token"

    const response = await POST(request(body, `linkedin_credential=${rawToken}`))
    const responseBody = await response.json()

    expect(response.status).toBe(401)
    expect(responseBody).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Connect LinkedIn before publishing.",
      },
    })
    expect(JSON.stringify(responseBody)).not.toContain(rawToken)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it.each([
    ["AUTH_REQUIRED", 401],
    ["INSUFFICIENT_SCOPE", 403],
    ["STALE_REVISION", 409],
    ["DUPLICATE_PUBLISH", 409],
    ["UNKNOWN_OUTCOME", 409],
    ["INVALID_ARTIFACT", 422],
    ["RATE_LIMITED", 429],
    ["INVALID_UPSTREAM_RESPONSE", 502],
    ["LINKEDIN_UNAVAILABLE", 503],
    ["CONFIGURATION_ERROR", 503],
  ] satisfies Array<[LinkedInErrorCode, number]>) (
    "maps %s to HTTP %i without provider details",
    async (code, expectedStatus) => {
      const providerDetail = "provider-body-with-secret-token"
      const handler = routeWithPublisher(async () => {
        throw new LinkedInError(code, "Safe public message", new Error(providerDetail))
      })

      const response = await handler(request(body))
      const responseBody = await response.json()

      expect(response.status).toBe(expectedStatus)
      expect(responseBody).toEqual({ error: { code, message: "Safe public message" } })
      expect(JSON.stringify(responseBody)).not.toContain(providerDetail)
      expect(JSON.stringify(responseBody)).not.toContain(credential.accessToken)
      expect(response.headers.get("cache-control")).toBe("no-store")
    },
  )

  it("returns safe retry metadata for rate limiting", async () => {
    const handler = routeWithPublisher(async () => {
      throw new LinkedInError(
        "RATE_LIMITED",
        "Try again later.",
        undefined,
        { retryAfterSeconds: 60 },
      )
    })

    const response = await handler(request(body))

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    await expect(response.json()).resolves.toEqual({
      error: { code: "RATE_LIMITED", message: "Try again later.", retryAfterSeconds: 60 },
    })
  })

  it("returns only the safe publish result", async () => {
    const handler = routeWithPublisher(async (input) => {
      if (input.credential.accessToken !== credential.accessToken) {
        throw new Error("Expected the loaded credential")
      }
      return {
        postUrn: "urn:li:share:post-789",
        postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
        publishedAt: "2026-08-03T10:00:01.000Z",
      }
    })

    const response = await handler(request(body, `linkedin_credential=${credential.accessToken}`))
    const responseBody = await response.json()

    expect(response.status).toBe(200)
    expect(responseBody).toEqual({
      postUrn: "urn:li:share:post-789",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
      publishedAt: "2026-08-03T10:00:01.000Z",
    })
    expect(Object.keys(responseBody).sort()).toEqual(["postUrl", "postUrn", "publishedAt"])
    expect(JSON.stringify(responseBody)).not.toContain(credential.accessToken)
    expect(JSON.stringify(responseBody)).not.toContain(credential.subject)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})

function routeWithPublisher(
  publish: ApprovedCarouselPublisher["publish"],
): ReturnType<typeof createPublishRoute> {
  return createPublishRoute({
    loadConfig: () => config,
    loadCredential: () => credential,
    createPublisher: () => ({ publish } as ApprovedCarouselPublisher),
  })
}

function request(requestBody: unknown, cookie?: string): NextRequest {
  return new NextRequest("http://localhost:3100/api/linkedin/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(requestBody),
  })
}
