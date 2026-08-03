import { KeyObject, sign as signBytes } from "node:crypto"
import {
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
} from "jose"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { LinkedInConfig } from "./config"
import {
  LINKEDIN_AUTHORIZATION_ENDPOINT,
  LINKEDIN_DISCOVERY_ENDPOINT,
  LINKEDIN_TOKEN_ENDPOINT,
  buildLinkedInAuthorizationUrl,
  createBrowserBinding,
  createOAuthState,
  exchangeAuthorizationCode,
  verifyLinkedInIdToken,
  verifyOAuthState,
} from "./oauth"

const config: LinkedInConfig = {
  clientId: "configured-client-id",
  clientSecret: "configured-client-secret",
  redirectUri: "http://localhost:3100/api/linkedin/oauth/callback",
  sessionSecret: "a-session-secret-that-is-at-least-32-bytes",
  apiVersion: "202603",
}

const issuer = "https://www.linkedin.com"
const jwksUri = "https://www.linkedin.com/oauth/openid/jwks"
let signingKey: CryptoKey
let publicJwk: JWK

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true })
  signingKey = keys.privateKey
  publicJwk = {
    ...await exportJWK(keys.publicKey),
    alg: "RS256",
    kid: "fixture-key",
    use: "sig",
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe("LinkedIn OAuth authorization", () => {
  it("builds an authorization URL with openid profile w_member_social", () => {
    const url = buildLinkedInAuthorizationUrl(config, "signed-state")

    expect(url.origin + url.pathname).toBe(LINKEDIN_AUTHORIZATION_ENDPOINT)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("configured-client-id")
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri)
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social")
    expect(url.searchParams.get("state")).toBe("signed-state")
    expect(url.searchParams.has("email")).toBe(false)
  })

  it("generates an expiring signed state and verifies it timing-safely", () => {
    const browserBinding = createBrowserBinding()
    const issuedAt = Date.UTC(2026, 7, 2, 12)
    const state = createOAuthState(browserBinding, config.sessionSecret, () => issuedAt)

    expect(verifyOAuthState(state, browserBinding, config.sessionSecret, () => issuedAt + 599_999)).toBe(true)
    expect(verifyOAuthState(state, browserBinding, config.sessionSecret, () => issuedAt + 600_001)).toBe(false)
  })

  it("rejects a state issued for a different browser session", () => {
    const state = createOAuthState("first-browser", config.sessionSecret)

    expect(verifyOAuthState(state, "second-browser", config.sessionSecret)).toBe(false)
  })

  it("rejects a modified state", () => {
    const browserBinding = createBrowserBinding()
    const state = createOAuthState(browserBinding, config.sessionSecret)
    const modified = `${state.slice(0, -1)}${state.endsWith("A") ? "B" : "A"}`

    expect(verifyOAuthState(modified, browserBinding, config.sessionSecret)).toBe(false)
  })
})

describe("LinkedIn OAuth token exchange", () => {
  it("exchanges the authorization code using the configured redirect URI", async () => {
    let capturedUrl = ""
    let capturedInit: RequestInit | undefined
    const fetchFixture = async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = input.toString()
      capturedInit = init
      return Response.json({
        access_token: "access-token",
        expires_in: 3600,
        id_token: "signed-id-token",
        scope: "openid profile w_member_social",
        token_type: "Bearer",
      })
    }

    const tokens = await exchangeAuthorizationCode("authorization-code", config, fetchFixture)

    expect(capturedUrl).toBe(LINKEDIN_TOKEN_ENDPOINT)
    expect(capturedInit?.method).toBe("POST")
    expect(capturedInit?.redirect).toBe("manual")
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
    const body = new URLSearchParams(capturedInit?.body?.toString())
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "authorization-code",
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    })
    expect(tokens).toEqual({
      accessToken: "access-token",
      expiresIn: 3600,
      idToken: "signed-id-token",
      scope: "openid profile w_member_social",
    })
  })

  it("aborts token exchange at an explicit deadline", async () => {
    vi.useFakeTimers()
    const fetchFixture = (_input: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      })
    )

    const pending = exchangeAuthorizationCode("authorization-code", config, fetchFixture, 25)
    const rejection = expect(pending).rejects.toMatchObject({ code: "LINKEDIN_UNAVAILABLE" })
    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })

  it("does not expose a provider response body when token exchange fails", async () => {
    const fetchFixture = async () => Response.json(
      { error: "invalid_grant", error_description: "sensitive provider detail" },
      { status: 400 },
    )

    await expect(exchangeAuthorizationCode("bad-code", config, fetchFixture)).rejects.toMatchObject({
      code: "LINKEDIN_UNAVAILABLE",
      message: "LinkedIn authorization could not be completed.",
    })
  })
})

describe("LinkedIn OIDC identity", () => {
  it("verifies ID-token issuer, audience, signature, and expiration", async () => {
    const valid = await signIdToken()
    const wrongIssuer = await signIdToken({ issuer: "https://attacker.example" })
    const wrongAudience = await signIdToken({ audience: "other-client" })
    const expired = await signIdToken({ expirationTime: Math.floor(Date.now() / 1000) - 60 })
    const otherKeys = await generateKeyPair("RS256", { extractable: true })
    const wrongSignature = await signIdToken({ privateKey: otherKeys.privateKey })
    const fetchFixture = createOidcFetchFixture()

    await expect(verifyLinkedInIdToken(valid, config, fetchFixture)).resolves.toMatchObject({
      subject: "member-123",
      displayName: "Ada Lovelace",
    })
    expect(fetchFixture.requestInits.every((init) => (
      init.redirect === "manual" && init.signal instanceof AbortSignal
    ))).toBe(true)
    await expect(verifyLinkedInIdToken(wrongIssuer, config, fetchFixture)).rejects.toThrow()
    await expect(verifyLinkedInIdToken(wrongAudience, config, fetchFixture)).rejects.toThrow()
    await expect(verifyLinkedInIdToken(expired, config, fetchFixture)).rejects.toThrow()
    await expect(verifyLinkedInIdToken(wrongSignature, config, fetchFixture)).rejects.toThrow()
  })

  it("maps the OIDC subject to a personal author URN", async () => {
    const identity = await verifyLinkedInIdToken(
      await signIdToken(),
      config,
      createOidcFetchFixture(),
    )

    expect(identity).toEqual({
      subject: "member-123",
      authorUrn: "urn:li:person:member-123",
      displayName: "Ada Lovelace",
    })
  })

  it("rejects an ID token without an expiration claim", async () => {
    await expect(verifyLinkedInIdToken(
      await signIdToken({ expirationTime: null }),
      config,
      createOidcFetchFixture(),
    )).rejects.toThrow()
  })

  it("rejects discovery metadata from an unexpected issuer", async () => {
    const fetchFixture = createOidcFetchFixture({ discoveredIssuer: "https://attacker.example" })

    await expect(verifyLinkedInIdToken(await signIdToken(), config, fetchFixture)).rejects.toThrow()
  })

  it("rejects the legacy LinkedIn issuer ending in /oauth", async () => {
    const legacyIssuer = "https://www.linkedin.com/oauth"
    const fetchFixture = createOidcFetchFixture({ discoveredIssuer: legacyIssuer })

    await expect(verifyLinkedInIdToken(
      await signIdToken({ issuer: legacyIssuer }),
      config,
      fetchFixture,
    )).rejects.toThrow()
  })

  it("rejects discovery metadata that redirects trust to a foreign JWKS", async () => {
    const foreignJwksUri = "https://attacker.example/jwks"
    const foreignKeys = await generateKeyPair("RS256", { extractable: true })
    const foreignJwk: JWK = {
      ...await exportJWK(foreignKeys.publicKey),
      alg: "RS256",
      kid: "fixture-key",
      use: "sig",
    }
    const requestedUrls: string[] = []
    const fetchFixture = createOidcFetchFixture({
      discoveredJwksUri: foreignJwksUri,
      jwk: foreignJwk,
      requestedUrls,
    })

    await expect(verifyLinkedInIdToken(
      await signIdToken({ privateKey: foreignKeys.privateKey }),
      config,
      fetchFixture,
    )).rejects.toThrow()
    expect(requestedUrls).not.toContain(foreignJwksUri)
  })

  it("rejects an ID token issued beyond the allowed future clock skew", async () => {
    const currentDate = new Date("2030-01-01T00:00:00.000Z")
    const now = Math.floor(currentDate.getTime() / 1000)

    await expect(verifyLinkedInIdToken(
      await signIdToken({ issuedAt: now + 61, expirationTime: now + 300 }),
      config,
      createOidcFetchFixture(),
      currentDate,
    )).rejects.toThrow()
  })

  it("rejects an ID token older than the immediate exchange window", async () => {
    const currentDate = new Date("2030-01-01T00:00:00.000Z")
    const now = Math.floor(currentDate.getTime() / 1000)

    await expect(verifyLinkedInIdToken(
      await signIdToken({ issuedAt: now - 661, expirationTime: now + 300 }),
      config,
      createOidcFetchFixture(),
      currentDate,
    )).rejects.toThrow()
  })
})

interface SignOverrides {
  issuer?: string
  audience?: string
  expirationTime?: number | null
  issuedAt?: number
  privateKey?: CryptoKey
}

async function signIdToken(overrides: SignOverrides = {}) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key" }))
    .toString("base64url")
  const payload: Record<string, string | number> = {
    name: "Ada Lovelace",
    sub: "member-123",
    iss: overrides.issuer ?? issuer,
    aud: overrides.audience ?? config.clientId,
    iat: overrides.issuedAt ?? Math.floor(Date.now() / 1000),
  }
  if (overrides.expirationTime !== null) {
    payload.exp = overrides.expirationTime ?? Math.floor(Date.now() / 1000) + 300
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = signBytes(
    "RSA-SHA256",
    Buffer.from(signingInput),
    KeyObject.from(overrides.privateKey ?? signingKey),
  )
  return `${signingInput}.${signature.toString("base64url")}`
}

interface OidcFetchFixtureOptions {
  discoveredIssuer?: string
  discoveredJwksUri?: string
  jwk?: JWK
  requestedUrls?: string[]
}

function createOidcFetchFixture(options: OidcFetchFixtureOptions = {}) {
  const requestInits: RequestInit[] = []
  const fixture = async (input: string | URL | Request, init?: RequestInit) => {
    requestInits.push(init ?? {})
    const url = input.toString()
    options.requestedUrls?.push(url)
    if (url === LINKEDIN_DISCOVERY_ENDPOINT) {
      return Response.json({
        issuer: options.discoveredIssuer ?? issuer,
        authorization_endpoint: LINKEDIN_AUTHORIZATION_ENDPOINT,
        token_endpoint: LINKEDIN_TOKEN_ENDPOINT,
        jwks_uri: options.discoveredJwksUri ?? jwksUri,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      })
    }
    if (url === (options.discoveredJwksUri ?? jwksUri)) {
      return Response.json({ keys: [options.jwk ?? publicJwk] })
    }
    throw new Error(`Unexpected network request: ${url}`)
  }
  return Object.assign(fixture, { requestInits })
}
