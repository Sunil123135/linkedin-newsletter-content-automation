import { z } from "zod"
import { LinkedInError } from "./errors"

const linkedinEnvironmentSchema = z.object({
  LINKEDIN_CLIENT_ID: z.string().min(1),
  LINKEDIN_CLIENT_SECRET: z.string().min(1),
  LINKEDIN_REDIRECT_URI: z.url(),
  LINKEDIN_SESSION_SECRET: z.string().refine(
    (secret) => Buffer.byteLength(secret, "utf8") >= 32,
    "must be at least 32 bytes",
  ),
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/),
})

export interface LinkedInConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  sessionSecret: string
  apiVersion: string
}

export function parseLinkedInConfig(
  environment: Record<string, string | undefined> = process.env,
): LinkedInConfig {
  const parsed = linkedinEnvironmentSchema.safeParse(environment)
  if (!parsed.success) {
    throw new LinkedInError(
      "CONFIGURATION_ERROR",
      "LinkedIn integration is not configured.",
      parsed.error,
    )
  }

  return {
    clientId: parsed.data.LINKEDIN_CLIENT_ID,
    clientSecret: parsed.data.LINKEDIN_CLIENT_SECRET,
    redirectUri: parsed.data.LINKEDIN_REDIRECT_URI,
    sessionSecret: parsed.data.LINKEDIN_SESSION_SECRET,
    apiVersion: parsed.data.LINKEDIN_API_VERSION,
  }
}
