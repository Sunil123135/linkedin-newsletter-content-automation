import { describe, expect, it } from "vitest"
import { parseLinkedInConfig } from "./config"

const validEnvironment = {
  LINKEDIN_CLIENT_ID: "client-id",
  LINKEDIN_CLIENT_SECRET: "client-secret",
  LINKEDIN_REDIRECT_URI: "http://localhost:3100/api/linkedin/oauth/callback",
  LINKEDIN_SESSION_SECRET: "a-session-secret-that-is-at-least-32-bytes",
  LINKEDIN_API_VERSION: "202603",
}

describe("parseLinkedInConfig", () => {
  it("rejects missing LinkedIn environment variables", () => {
    expect(() => parseLinkedInConfig({})).toThrowError(
      expect.objectContaining({ code: "CONFIGURATION_ERROR" }),
    )
  })

  it("rejects a session secret shorter than 32 bytes", () => {
    expect(() => parseLinkedInConfig({
      ...validEnvironment,
      LINKEDIN_SESSION_SECRET: "short-secret",
    })).toThrowError(expect.objectContaining({ code: "CONFIGURATION_ERROR" }))
  })

  it("requires a six-digit LinkedIn API version", () => {
    expect(() => parseLinkedInConfig({
      ...validEnvironment,
      LINKEDIN_API_VERSION: "2026-03",
    })).toThrowError(expect.objectContaining({ code: "CONFIGURATION_ERROR" }))
  })

  it("returns the validated LinkedIn configuration", () => {
    expect(parseLinkedInConfig(validEnvironment)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3100/api/linkedin/oauth/callback",
      sessionSecret: "a-session-secret-that-is-at-least-32-bytes",
      apiVersion: "202603",
    })
  })
})
