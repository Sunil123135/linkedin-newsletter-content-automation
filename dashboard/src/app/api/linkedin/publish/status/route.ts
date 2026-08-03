import { createDefaultPublishStatusRoute } from "@/server/linkedin/publish-status-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = createDefaultPublishStatusRoute()
