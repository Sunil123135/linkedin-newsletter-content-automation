import { createDefaultPreviewRoute } from "@/server/linkedin/preflight-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = createDefaultPreviewRoute()
