import { describe, expect, it } from "vitest"

import type {
  CarouselArtifactStore,
  LoadedApprovedCarouselRun,
} from "../carousel-artifacts/artifact-store"
import { ArtifactValidationError } from "../carousel-artifacts/artifact-store"
import {
  buildApprovedArtifactChecksum,
  loadCarouselPreview,
  preflightApprovedCarousel,
} from "./preflight"

describe("LinkedIn publisher preflight", () => {
  it("returns only checksum-bound safe display metadata for the approved revision", async () => {
    const loaded = approvedRun()

    const result = await preflightApprovedCarousel(storeReturning(loaded), "run-123", 3)

    expect(result).toEqual({
      runId: "run-123",
      revision: 3,
      artifactChecksum: buildApprovedArtifactChecksum(loaded.run),
      documentTitle: "Server-approved field guide",
      caption: "Five dependable automation lessons.",
      pages: [1, 2, 3, 4, 5].map((index) => ({
        index,
        altText: `Slide ${index}`,
        mimeType: "image/png",
        checksum: String(index).repeat(64),
        previewUrl: `/api/linkedin/preflight/preview?runId=run-123&revision=3&index=${index}&checksum=${String(index).repeat(64)}`,
      })),
    })
    expect(Object.keys(result).sort()).toEqual([
      "artifactChecksum",
      "caption",
      "documentTitle",
      "pages",
      "revision",
      "runId",
    ])
    expect(JSON.stringify(result)).not.toMatch(/storageKey|accessToken|authorUrn|secret/i)
  })

  it("changes the binding when any approved caption, title, or page checksum changes", () => {
    const first = approvedRun().run
    const changedCaption = { ...first, caption: "A changed caption" }
    const changedSlide = {
      ...first,
      slides: first.slides.map((slide, index) => index === 2
        ? { ...slide, checksum: "f".repeat(64) }
        : slide),
    }

    expect(buildApprovedArtifactChecksum(changedCaption)).not.toBe(buildApprovedArtifactChecksum(first))
    expect(buildApprovedArtifactChecksum(changedSlide)).not.toBe(buildApprovedArtifactChecksum(first))
  })

  it("serves only the checksum-bound page from the revalidated approved revision", async () => {
    const loaded = approvedRun()

    await expect(loadCarouselPreview(
      storeReturning(loaded),
      "run-123",
      3,
      2,
      "2".repeat(64),
    )).resolves.toEqual({
      bytes: new Uint8Array([2]),
      mimeType: "image/png",
      altText: "Slide 2",
    })
  })

  it("rejects a stale preview checksum after revalidating the revision", async () => {
    await expect(loadCarouselPreview(
      storeReturning(approvedRun()),
      "run-123",
      3,
      2,
      "0".repeat(64),
    )).rejects.toMatchObject({ code: "STALE_REVISION" })
  })

  it("preserves stale-revision validation from the artifact store", async () => {
    const store: CarouselArtifactStore = {
      async loadApprovedRun() {
        throw new ArtifactValidationError("STALE_REVISION", "stale")
      },
    }

    await expect(preflightApprovedCarousel(store, "run-123", 4))
      .rejects.toMatchObject({ code: "STALE_REVISION" })
  })
})

function storeReturning(run: LoadedApprovedCarouselRun): CarouselArtifactStore {
  return { async loadApprovedRun() { return run } }
}

function approvedRun(): LoadedApprovedCarouselRun {
  const slides = [1, 2, 3, 4, 5].map((index) => ({
    id: `slide-${index}`,
    index: index as 1 | 2 | 3 | 4 | 5,
    storageKey: `run-123/slides/0${index}.png`,
    mimeType: "image/png" as const,
    width: 1080 as const,
    height: 1080 as const,
    altText: `Slide ${index}`,
    checksum: String(index).repeat(64),
  }))
  return {
    run: {
      id: "run-123",
      revision: 3,
      status: "approved",
      caption: "Five dependable automation lessons.",
      documentTitle: "Server-approved field guide",
      slides,
    },
    slides: slides.map((asset, index) => ({ asset, bytes: new Uint8Array([index + 1]) })),
  }
}
