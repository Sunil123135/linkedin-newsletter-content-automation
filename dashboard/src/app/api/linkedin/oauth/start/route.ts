import { NextResponse } from "next/server"
import { parseLinkedInConfig } from "@/server/linkedin/config"
import {
  LINKEDIN_OAUTH_STATE_COOKIE,
  OAUTH_STATE_LIFETIME_MS,
  buildLinkedInAuthorizationUrl,
  createBrowserBinding,
  createOAuthState,
} from "@/server/linkedin/oauth"

export const runtime = "nodejs"

export async function GET() {
  const config = parseLinkedInConfig()
  const browserBinding = createBrowserBinding()
  const state = createOAuthState(browserBinding, config.sessionSecret)
  const response = NextResponse.redirect(buildLinkedInAuthorizationUrl(config, state))

  response.cookies.set(LINKEDIN_OAUTH_STATE_COOKIE, browserBinding, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_LIFETIME_MS / 1000,
    expires: new Date(Date.now() + OAUTH_STATE_LIFETIME_MS),
  })

  return response
}
