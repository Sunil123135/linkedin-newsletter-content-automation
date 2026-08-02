import { describe, expect, it } from "vitest"
import {
  LINKEDIN_CREDENTIAL_COOKIE,
  NextLinkedInCredentialStore,
  decryptLinkedInCredential,
  encryptLinkedInCredential,
  type LinkedInCredential,
} from "./credential-store"

const sessionSecret = "a-session-secret-that-is-at-least-32-bytes"
const credential: LinkedInCredential = {
  accessToken: "linkedin-access-token-that-must-stay-secret",
  expiresAt: Date.UTC(2026, 7, 2, 13),
  subject: "member-123",
  authorUrn: "urn:li:person:member-123",
  displayName: "Ada Lovelace",
}

describe("LinkedIn credential encryption", () => {
  it("encrypts and decrypts a credential without exposing the access token", () => {
    const encrypted = encryptLinkedInCredential(credential, sessionSecret)

    expect(encrypted).not.toContain(credential.accessToken)
    expect(decryptLinkedInCredential(encrypted, sessionSecret)).toEqual(credential)
  })

  it("rejects a modified encrypted credential", () => {
    const encrypted = encryptLinkedInCredential(credential, sessionSecret)
    const envelope = JSON.parse(Buffer.from(encrypted, "base64url").toString("utf8")) as {
      ciphertext: string
    }
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`
    const modified = Buffer.from(JSON.stringify(envelope)).toString("base64url")

    expect(() => decryptLinkedInCredential(modified, sessionSecret)).toThrow()
  })
})

describe("NextLinkedInCredentialStore", () => {
  it("writes an HttpOnly credential cookie with the credential expiry", () => {
    const cookies = new MemoryCookieStore()
    const store = new NextLinkedInCredentialStore(cookies, sessionSecret, Date.now, cookies)

    store.save(credential)

    expect(cookies.lastWrite).toMatchObject({
      name: LINKEDIN_CREDENTIAL_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(credential.expiresAt),
      },
    })
    expect(cookies.lastWrite?.value).not.toContain(credential.accessToken)
  })

  it("treats an expired credential as disconnected", () => {
    const cookies = new MemoryCookieStore()
    const store = new NextLinkedInCredentialStore(
      cookies,
      sessionSecret,
      () => credential.expiresAt + 1,
      cookies,
    )
    store.save(credential)

    expect(store.load()).toBeUndefined()
  })

  it("treats a tampered credential cookie as disconnected", () => {
    const cookies = new MemoryCookieStore()
    cookies.values.set(LINKEDIN_CREDENTIAL_COOKIE, "not-an-authenticated-envelope")

    expect(new NextLinkedInCredentialStore(cookies, sessionSecret).load()).toBeUndefined()
  })
})

interface CookieOptions {
  httpOnly?: boolean
  sameSite?: "lax" | "strict" | "none"
  secure?: boolean
  path?: string
  expires?: Date
  maxAge?: number
}

class MemoryCookieStore {
  readonly values = new Map<string, string>()
  lastWrite?: { name: string; value: string; options: CookieOptions }

  get(name: string) {
    const value = this.values.get(name)
    return value === undefined ? undefined : { name, value }
  }

  set(name: string, value: string, options: CookieOptions) {
    this.values.set(name, value)
    this.lastWrite = { name, value, options }
  }
}
