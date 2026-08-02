import { KeyObject, sign as signBytes } from "node:crypto"
import { exportJWK, generateKeyPair, type CryptoKey, type JWK } from "jose"
import { NextRequest } from "next/server"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getConnection } from "./connection/route"
import { GET as oauthCallback } from "./oauth/callback/route"
import { GET as startOAuth } from "./oauth/start/route"
import { LINKEDIN_CREDENTIAL_COOKIE } from "@/server/linkedin/credential-store"
import {
  LINKEDIN_DISCOVERY_ENDPOINT,
  LINKEDIN_TOKEN_ENDPOINT,
} from "@/server/linkedin/oauth"

const issuer = "https://www.linkedin.com/oauth"
const jwksUri = "https://www.linkedin.com/oauth/openid/jwks"
let signingKey: CryptoKey
let publicJwk: JWK

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true })
  signingKey = keys.privateKey
  publicJwk = {
    ...await exportJWK(keys.publicKey),
    alg: "RS256",
    kid: "route-fixture-key",
    use: "sig",
  }
})

beforeEach(() => {
  vi.stubEnv("LINKEDIN_CLIENT_ID", "configured-client-id")
  vi.stubEnv("LINKEDIN_CLIENT_SECRET", "configured-client-secret")
  vi.stubEnv("LINKEDIN_REDIRECT_URI", "http://localhost:3100/api/linkedin/oauth/callback")
  vi.stubEnv("LINKEDIN_SESSION_SECRET", "a-session-secret-that-is-at-least-32-bytes")
  vi.stubEnv("LINKEDIN_API_VERSION", "202603")
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`Unexpected network request: ${input.toString()}`)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("LinkedIn OAuth routes", () => {
  it("GET /oauth/start redirects to LinkedIn and sets an HttpOnly state cookie", async () => {
    const response = await startOAuth()
    const location = new URL(requiredHeader(response, "location"))
    const stateCookie = response.cookies.get("linkedin_oauth_state")

    expect(response.status).toBe(307)
    expect(location.origin + location.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(location.searchParams.get("state")).toBeTruthy()
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=lax")
    expect(stateCookie?.value).toBeTruthy()
  })

  it("GET /oauth/callback rejects a mismatched state", async () => {
    const authorization = await beginAuthorization()
    const network = vi.fn(async () => Response.json({}))
    vi.stubGlobal("fetch", network)

    const response = await oauthCallback(callbackRequest(
      "?code=authorization-code&state=modified-state",
      authorization.cookie,
    ))

    expect(new URL(requiredHeader(response, "location")).searchParams.get("linkedin")).toBe("state_invalid")
    expect(network).not.toHaveBeenCalled()
  })

  it("GET /oauth/callback handles LinkedIn denial without exchanging a code", async () => {
    const authorization = await beginAuthorization()
    const network = vi.fn(async () => Response.json({}))
    vi.stubGlobal("fetch", network)

    const response = await oauthCallback(callbackRequest(
      `?error=access_denied&error_description=${encodeURIComponent("sensitive provider detail")}&state=${encodeURIComponent(authorization.state)}`,
      authorization.cookie,
    ))
    const location = requiredHeader(response, "location")

    expect(new URL(location).searchParams.get("linkedin")).toBe("denied")
    expect(location).not.toContain("sensitive")
    expect(network).not.toHaveBeenCalled()
  })

  it("GET /oauth/callback returns a safe failure when code exchange fails", async () => {
    const authorization = await beginAuthorization()
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      if (input.toString() === LINKEDIN_TOKEN_ENDPOINT) {
        return Response.json(
          { error: "invalid_grant", error_description: "sensitive provider detail" },
          { status: 400 },
        )
      }
      throw new Error(`Unexpected network request: ${input.toString()}`)
    })

    const response = await oauthCallback(callbackRequest(
      `?code=bad-code&state=${encodeURIComponent(authorization.state)}`,
      authorization.cookie,
    ))
    const location = requiredHeader(response, "location")

    expect(new URL(location).searchParams.get("linkedin")).toBe("unavailable")
    expect(location).not.toContain("invalid_grant")
    expect(location).not.toContain("sensitive")
  })

  it("GET /oauth/callback stores the encrypted credential and redirects to the carousel", async () => {
    const authorization = await beginAuthorization()
    vi.stubGlobal("fetch", createSuccessfulLinkedInFetch(await signIdToken()))

    const response = await oauthCallback(callbackRequest(
      `?code=authorization-code&state=${encodeURIComponent(authorization.state)}`,
      authorization.cookie,
    ))
    const credentialCookie = response.cookies.get(LINKEDIN_CREDENTIAL_COOKIE)

    expect(requiredHeader(response, "location")).toBe(
      "http://localhost:3100/dashboard?workflow=carousel&linkedin=connected",
    )
    expect(credentialCookie?.value).toBeTruthy()
    expect(credentialCookie?.value).not.toContain("linkedin-access-token")
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
  })
})

describe("LinkedIn connection route", () => {
  it("GET /connection returns only safe connection metadata", async () => {
    const authorization = await beginAuthorization()
    vi.stubGlobal("fetch", createSuccessfulLinkedInFetch(await signIdToken()))
    const callback = await oauthCallback(callbackRequest(
      `?code=authorization-code&state=${encodeURIComponent(authorization.state)}`,
      authorization.cookie,
    ))
    const credentialCookie = callback.cookies.get(LINKEDIN_CREDENTIAL_COOKIE)
    if (!credentialCookie) {
      throw new Error("Expected callback to set a credential cookie")
    }

    const response = await getConnection(request("/api/linkedin/connection", credentialCookie))
    const body = await response.json()

    expect(body).toEqual({
      connected: true,
      displayName: "Ada Lovelace",
      expiresAt: expect.any(Number),
      reconnectRequired: false,
    })
    expect(Object.keys(body).sort()).toEqual([
      "connected",
      "displayName",
      "expiresAt",
      "reconnectRequired",
    ])
    expect(JSON.stringify(body)).not.toContain("linkedin-access-token")
    expect(JSON.stringify(body)).not.toContain("member-123")
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("GET /connection treats a missing credential as reconnect required", async () => {
    const response = await getConnection(request("/api/linkedin/connection"))

    await expect(response.json()).resolves.toEqual({
      connected: false,
      reconnectRequired: true,
    })
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})

function request(pathname: string, cookie?: { name: string; value: string }) {
  return new NextRequest(`http://localhost:3100${pathname}`, {
    headers: cookie ? { cookie: `${cookie.name}=${cookie.value}` } : undefined,
  })
}

function callbackRequest(search: string, cookie: { name: string; value: string }) {
  return request(`/api/linkedin/oauth/callback${search}`, cookie)
}

async function beginAuthorization() {
  const response = await startOAuth()
  const cookie = response.cookies.get("linkedin_oauth_state")
  const state = new URL(requiredHeader(response, "location")).searchParams.get("state")
  if (!cookie || !state) {
    throw new Error("Expected OAuth start response to contain state and browser cookie")
  }
  return { cookie, state }
}

function requiredHeader(response: Response, name: string): string {
  const value = response.headers.get(name)
  if (!value) {
    throw new Error(`Expected ${name} response header`)
  }
  return value
}

async function signIdToken() {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "route-fixture-key" }))
    .toString("base64url")
  const encodedPayload = Buffer.from(JSON.stringify({
    name: "Ada Lovelace",
    sub: "member-123",
    iss: issuer,
    aud: "configured-client-id",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString("base64url")
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = signBytes("RSA-SHA256", Buffer.from(signingInput), KeyObject.from(signingKey))
  return `${signingInput}.${signature.toString("base64url")}`
}

function createSuccessfulLinkedInFetch(idToken: string) {
  return async (input: string | URL | Request) => {
    const url = input.toString()
    if (url === LINKEDIN_TOKEN_ENDPOINT) {
      return Response.json({
        access_token: "linkedin-access-token",
        expires_in: 3600,
        id_token: idToken,
        scope: "openid profile w_member_social",
        token_type: "Bearer",
      })
    }
    if (url === LINKEDIN_DISCOVERY_ENDPOINT) {
      return Response.json({
        issuer,
        authorization_endpoint: "https://www.linkedin.com/oauth/v2/authorization",
        token_endpoint: LINKEDIN_TOKEN_ENDPOINT,
        jwks_uri: jwksUri,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      })
    }
    if (url === jwksUri) {
      return Response.json({ keys: [publicJwk] })
    }
    throw new Error(`Unexpected network request: ${url}`)
  }
}
