import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { parseLinkedInConfig } from "@/server/linkedin/config"
import { NextLinkedInCredentialStore } from "@/server/linkedin/credential-store"
import {
  LINKEDIN_OAUTH_STATE_COOKIE,
  exchangeAuthorizationCode,
  verifyLinkedInIdToken,
  verifyOAuthState,
} from "@/server/linkedin/oauth"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const config = parseLinkedInConfig()
  const state = request.nextUrl.searchParams.get("state")
  const browserBinding = request.cookies.get(LINKEDIN_OAUTH_STATE_COOKIE)?.value

  if (
    !state
    || !browserBinding
    || !verifyOAuthState(state, browserBinding, config.sessionSecret)
  ) {
    return failureRedirect(request, "state_invalid")
  }

  if (request.nextUrl.searchParams.has("error")) {
    return failureRedirect(request, "denied")
  }

  const code = request.nextUrl.searchParams.get("code")
  if (!code) {
    return failureRedirect(request, "unavailable")
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, config)
    const identity = await verifyLinkedInIdToken(tokens.idToken, config)
    const response = redirect(request, "connected")
    new NextLinkedInCredentialStore(
      response.cookies,
      config.sessionSecret,
      Date.now,
      response.cookies,
    ).save({
      accessToken: tokens.accessToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      subject: identity.subject,
      authorUrn: identity.authorUrn,
      displayName: identity.displayName,
    })
    clearStateCookie(response)
    return response
  } catch {
    return failureRedirect(request, "unavailable")
  }
}

function failureRedirect(request: NextRequest, status: "state_invalid" | "denied" | "unavailable") {
  const response = redirect(request, status)
  clearStateCookie(response)
  return response
}

function redirect(request: NextRequest, status: string) {
  const destination = new URL("/dashboard", request.url)
  destination.searchParams.set("workflow", "carousel")
  destination.searchParams.set("linkedin", status)
  return NextResponse.redirect(destination)
}

function clearStateCookie(response: NextResponse) {
  response.cookies.set(LINKEDIN_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  })
}
