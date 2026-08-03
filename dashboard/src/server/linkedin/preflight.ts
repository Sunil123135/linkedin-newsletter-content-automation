import { createHash } from "node:crypto"

import type {
  CarouselArtifactStore,
  LoadedApprovedCarouselRun,
} from "../carousel-artifacts/artifact-store"
import { ArtifactValidationError } from "../carousel-artifacts/artifact-store"
import type { ApprovedCarouselRun } from "../carousel-artifacts/approved-run"

export interface SafeCarouselPagePreflight {
  index: 1 | 2 | 3 | 4 | 5
  altText: string
  mimeType: "image/png" | "image/jpeg"
  checksum: string
  previewUrl: string
}

export interface SafeCarouselPreflight {
  runId: string
  revision: number
  artifactChecksum: string
  documentTitle: string
  caption: string
  pages: SafeCarouselPagePreflight[]
}

export function buildApprovedArtifactChecksum(run: ApprovedCarouselRun): string {
  return createHash("sha256").update(JSON.stringify([
    run.id,
    run.revision,
    run.status,
    run.documentTitle,
    run.caption,
    run.slides.map((slide) => [
      slide.index,
      slide.mimeType,
      slide.width,
      slide.height,
      slide.altText,
      slide.checksum,
    ]),
  ])).digest("hex")
}

export async function preflightApprovedCarousel(
  artifactStore: CarouselArtifactStore,
  runId: string,
  revision: number,
): Promise<SafeCarouselPreflight> {
  const loaded = await artifactStore.loadApprovedRun(runId, revision)
  return safePreflight(loaded)
}

export async function loadCarouselPreview(
  artifactStore: CarouselArtifactStore,
  runId: string,
  revision: number,
  index: number,
  checksum: string,
): Promise<{ bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; altText: string }> {
  const loaded = await artifactStore.loadApprovedRun(runId, revision)
  const slide = loaded.slides.find((candidate) => candidate.asset.index === index)
  if (!slide || slide.asset.checksum !== checksum) {
    throw new ArtifactValidationError(
      "STALE_REVISION",
      "The requested carousel preview no longer matches the approved revision",
    )
  }
  return {
    bytes: slide.bytes,
    mimeType: slide.asset.mimeType,
    altText: slide.asset.altText,
  }
}

function safePreflight(loaded: LoadedApprovedCarouselRun): SafeCarouselPreflight {
  const { run } = loaded
  return {
    runId: run.id,
    revision: run.revision,
    artifactChecksum: buildApprovedArtifactChecksum(run),
    documentTitle: run.documentTitle,
    caption: run.caption,
    pages: run.slides.map((slide) => ({
      index: slide.index,
      altText: slide.altText,
      mimeType: slide.mimeType,
      checksum: slide.checksum,
      previewUrl: previewUrl(run.id, run.revision, slide.index, slide.checksum),
    })),
  }
}

function previewUrl(runId: string, revision: number, index: number, checksum: string): string {
  const query = new URLSearchParams({
    runId,
    revision: String(revision),
    index: String(index),
    checksum,
  })
  return `/api/linkedin/preflight/preview?${query}`
}
