import { createDefaultPublishRoute } from "@/server/linkedin/publish-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createDefaultPublishRoute()
