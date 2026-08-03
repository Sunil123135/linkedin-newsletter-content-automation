import type { ExecutionStatus } from "@/features/automation/types"

export type LinkedInPublisherState =
  | "disconnected"
  | "locked"
  | "ready"
  | "preparing_pdf"
  | "registering_upload"
  | "uploading_document"
  | "creating_post"
  | "published"
  | "failed"

export interface PublishCarouselRequest {
  runId: string
  revision: number
  artifactChecksum: string
  idempotencyKey: string
}

export function toCanvasExecutionStatus(
  state: LinkedInPublisherState,
): ExecutionStatus {
  if (state === "published") return "completed"
  if (state === "failed") return "error"
  if (
    state === "preparing_pdf" ||
    state === "registering_upload" ||
    state === "uploading_document" ||
    state === "creating_post"
  ) return "running"
  return "idle"
}
