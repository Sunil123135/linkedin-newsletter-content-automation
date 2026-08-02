import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { parseLinkedInConfig } from "@/server/linkedin/config"
import { NextLinkedInCredentialStore } from "@/server/linkedin/credential-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface LinkedInConnectionResponse {
  connected: boolean
  displayName?: string
  expiresAt?: number
  reconnectRequired: boolean
}

export async function GET(request: NextRequest) {
  let body: LinkedInConnectionResponse = {
    connected: false,
    reconnectRequired: true,
  }

  try {
    const config = parseLinkedInConfig()
    const credential = new NextLinkedInCredentialStore(
      request.cookies,
      config.sessionSecret,
    ).load()
    if (credential) {
      body = {
        connected: true,
        displayName: credential.displayName,
        expiresAt: credential.expiresAt,
        reconnectRequired: false,
      }
    }
  } catch {
    // Configuration and credential failures are intentionally indistinguishable to clients.
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  })
}
