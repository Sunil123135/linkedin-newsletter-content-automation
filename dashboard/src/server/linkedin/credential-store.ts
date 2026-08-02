import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { z } from "zod"

export const LINKEDIN_CREDENTIAL_COOKIE = "linkedin_credential"

export interface LinkedInCredential {
  accessToken: string
  expiresAt: number
  subject: string
  authorUrn: `urn:li:person:${string}`
  displayName: string
}

export interface LinkedInCredentialStore {
  load(): LinkedInCredential | undefined
  save(credential: LinkedInCredential): void
  clear(): void
}

interface CookieOptions {
  httpOnly?: boolean
  sameSite?: "lax" | "strict" | "none"
  secure?: boolean
  path?: string
  expires?: Date
  maxAge?: number
}

interface NextCookieReader {
  get(name: string): { value: string } | undefined
}

interface NextCookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown
}

interface CredentialEnvelope {
  version: 1
  iv: string
  tag: string
  ciphertext: string
}

const credentialSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
  subject: z.string().min(1),
  authorUrn: z.custom<`urn:li:person:${string}`>(
    (value) => typeof value === "string" && value.startsWith("urn:li:person:") && value.length > 14,
  ),
  displayName: z.string(),
})

export function encryptLinkedInCredential(
  credential: LinkedInCredential,
  sessionSecret: string,
  cookieName = LINKEDIN_CREDENTIAL_COOKIE,
): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(sessionSecret), iv)
  cipher.setAAD(Buffer.from(cookieName, "utf8"))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
    cipher.final(),
  ])

  const envelope: CredentialEnvelope = {
    version: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  }

  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")
}

export function decryptLinkedInCredential(
  encryptedCredential: string,
  sessionSecret: string,
  cookieName = LINKEDIN_CREDENTIAL_COOKIE,
): LinkedInCredential {
  const envelope = parseEnvelope(encryptedCredential)
  const iv = Buffer.from(envelope.iv, "base64url")
  const tag = Buffer.from(envelope.tag, "base64url")
  if (iv.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error("Invalid credential envelope")
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(sessionSecret), iv)
  decipher.setAAD(Buffer.from(cookieName, "utf8"))
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ])

  return credentialSchema.parse(JSON.parse(plaintext.toString("utf8")))
}

export class NextLinkedInCredentialStore implements LinkedInCredentialStore {
  constructor(
    private readonly cookies: NextCookieReader,
    private readonly sessionSecret: string,
    private readonly now: () => number = Date.now,
    private readonly cookieWriter?: NextCookieWriter,
  ) {}

  load(): LinkedInCredential | undefined {
    const encryptedCredential = this.cookies.get(LINKEDIN_CREDENTIAL_COOKIE)?.value
    if (!encryptedCredential) {
      return undefined
    }

    try {
      const credential = decryptLinkedInCredential(encryptedCredential, this.sessionSecret)
      return credential.expiresAt > this.now() ? credential : undefined
    } catch {
      return undefined
    }
  }

  save(credential: LinkedInCredential): void {
    this.writer().set(
      LINKEDIN_CREDENTIAL_COOKIE,
      encryptLinkedInCredential(credential, this.sessionSecret),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(credential.expiresAt),
      },
    )
  }

  clear(): void {
    this.writer().set(LINKEDIN_CREDENTIAL_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    })
  }

  private writer(): NextCookieWriter {
    if (!this.cookieWriter) {
      throw new Error("A response cookie writer is required for credential changes")
    }
    return this.cookieWriter
  }
}

function deriveEncryptionKey(sessionSecret: string): Buffer {
  return createHash("sha256").update(sessionSecret, "utf8").digest()
}

function parseEnvelope(encryptedCredential: string): CredentialEnvelope {
  const value = JSON.parse(Buffer.from(encryptedCredential, "base64url").toString("utf8")) as unknown
  if (
    typeof value !== "object"
    || value === null
    || !("version" in value)
    || value.version !== 1
    || !("iv" in value)
    || typeof value.iv !== "string"
    || !("tag" in value)
    || typeof value.tag !== "string"
    || !("ciphertext" in value)
    || typeof value.ciphertext !== "string"
  ) {
    throw new Error("Invalid credential envelope")
  }

  return value as CredentialEnvelope
}
