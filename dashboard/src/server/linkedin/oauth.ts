import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
} from "jose"
import { z } from "zod"
import type { LinkedInConfig } from "./config"
import { LinkedInError } from "./errors"

export const LINKEDIN_AUTHORIZATION_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization"
export const LINKEDIN_TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken"
export const LINKEDIN_DISCOVERY_ENDPOINT = "https://www.linkedin.com/oauth/.well-known/openid-configuration"
export const LINKEDIN_OIDC_ISSUER = "https://www.linkedin.com"
export const LINKEDIN_JWKS_ENDPOINT = "https://www.linkedin.com/oauth/openid/jwks"
export const LINKEDIN_SCOPES = "openid profile w_member_social"
export const LINKEDIN_OAUTH_STATE_COOKIE = "linkedin_oauth_state"
export const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000
export const OIDC_MAX_TOKEN_AGE_SECONDS = OAUTH_STATE_LIFETIME_MS / 1000
export const OIDC_CLOCK_TOLERANCE_SECONDS = 60

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface OAuthStatePayload {
  version: 1
  nonce: string
  expiresAt: number
}

export interface LinkedInTokens {
  accessToken: string
  expiresIn: number
  idToken: string
  scope: string
}

export interface VerifiedLinkedInIdentity {
  subject: string
  authorUrn: `urn:li:person:${string}`
  displayName: string
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  id_token: z.string().min(1),
  scope: z.string(),
})

const discoverySchema = z.object({
  issuer: z.literal(LINKEDIN_OIDC_ISSUER),
  jwks_uri: z.literal(LINKEDIN_JWKS_ENDPOINT),
})

export function buildLinkedInAuthorizationUrl(
  config: LinkedInConfig,
  state: string,
): URL {
  const url = new URL(LINKEDIN_AUTHORIZATION_ENDPOINT)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: LINKEDIN_SCOPES,
    state,
  }).toString()
  return url
}

export function createBrowserBinding(): string {
  return randomBytes(32).toString("base64url")
}

export function createOAuthState(
  browserBinding: string,
  sessionSecret: string,
  now: () => number = Date.now,
): string {
  const payload: OAuthStatePayload = {
    version: 1,
    nonce: randomBytes(32).toString("base64url"),
    expiresAt: now() + OAUTH_STATE_LIFETIME_MS,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const mac = signState(encodedPayload, browserBinding, sessionSecret)
  return `${encodedPayload}.${mac.toString("base64url")}`
}

export function verifyOAuthState(
  state: string,
  browserBinding: string,
  sessionSecret: string,
  now: () => number = Date.now,
): boolean {
  try {
    const [encodedPayload, encodedMac, extra] = state.split(".")
    if (!encodedPayload || !encodedMac || extra !== undefined) {
      return false
    }

    const suppliedMac = Buffer.from(encodedMac, "base64url")
    if (suppliedMac.toString("base64url") !== encodedMac) {
      return false
    }
    const expectedMac = signState(encodedPayload, browserBinding, sessionSecret)
    if (suppliedMac.byteLength !== expectedMac.byteLength || !timingSafeEqual(suppliedMac, expectedMac)) {
      return false
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown
    return isOAuthStatePayload(payload) && payload.expiresAt > now()
  } catch {
    return false
  }
}

export async function exchangeAuthorizationCode(
  code: string,
  config: LinkedInConfig,
  fetchImplementation: FetchImplementation = fetch,
): Promise<LinkedInTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  let response: Response
  try {
    response = await fetchImplementation(LINKEDIN_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    })
  } catch (error) {
    throw authorizationFailure(error)
  }

  if (!response.ok) {
    throw authorizationFailure()
  }

  try {
    const tokens = tokenResponseSchema.parse(await response.json())
    return {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      idToken: tokens.id_token,
      scope: tokens.scope,
    }
  } catch (error) {
    throw authorizationFailure(error)
  }
}

export async function verifyLinkedInIdToken(
  idToken: string,
  config: LinkedInConfig,
  fetchImplementation: FetchImplementation = fetch,
  currentDate: Date = new Date(),
): Promise<VerifiedLinkedInIdentity> {
  const metadata = await loadDiscoveryMetadata(fetchImplementation)
  const jwks = createRemoteJWKSet(new URL(LINKEDIN_JWKS_ENDPOINT), {
    [customFetch]: (url, options) => fetchImplementation(url, options),
  })
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: metadata.issuer,
    audience: config.clientId,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub"],
    maxTokenAge: OIDC_MAX_TOKEN_AGE_SECONDS,
    clockTolerance: OIDC_CLOCK_TOLERANCE_SECONDS,
    currentDate,
  })

  if (typeof payload.sub !== "string" || payload.sub.length === 0 || typeof payload.name !== "string") {
    throw authorizationFailure()
  }

  return {
    subject: payload.sub,
    authorUrn: `urn:li:person:${payload.sub}`,
    displayName: payload.name,
  }
}

async function loadDiscoveryMetadata(fetchImplementation: FetchImplementation) {
  let response: Response
  try {
    response = await fetchImplementation(LINKEDIN_DISCOVERY_ENDPOINT, { cache: "no-store" })
  } catch (error) {
    throw authorizationFailure(error)
  }
  if (!response.ok) {
    throw authorizationFailure()
  }

  try {
    return discoverySchema.parse(await response.json())
  } catch (error) {
    throw authorizationFailure(error)
  }
}

function signState(encodedPayload: string, browserBinding: string, sessionSecret: string): Buffer {
  return createHmac("sha256", sessionSecret)
    .update(encodedPayload, "utf8")
    .update(".", "utf8")
    .update(browserBinding, "utf8")
    .digest()
}

function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
  return typeof value === "object"
    && value !== null
    && "version" in value
    && value.version === 1
    && "nonce" in value
    && typeof value.nonce === "string"
    && value.nonce.length > 0
    && "expiresAt" in value
    && typeof value.expiresAt === "number"
    && Number.isSafeInteger(value.expiresAt)
}

function authorizationFailure(cause?: unknown): LinkedInError {
  return new LinkedInError(
    "LINKEDIN_UNAVAILABLE",
    "LinkedIn authorization could not be completed.",
    cause,
  )
}
