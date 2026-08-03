import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { deflateSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import {
  FileSystemCarouselArtifactStore,
  MAX_CAROUSEL_MANIFEST_BYTES,
  MAX_CAROUSEL_SLIDE_BYTES,
} from "./artifact-store"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("FileSystemCarouselArtifactStore", () => {
  it("loads an approved manifest and five verified slide buffers", async () => {
    const fixture = await createApprovedRunFixture()

    const loaded = await new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision)

    expect(loaded.run).toEqual(fixture.run)
    expect(loaded.slides).toHaveLength(5)
    expect(loaded.slides.map((slide) => slide.asset.id)).toEqual([
      "slide-1",
      "slide-2",
      "slide-3",
      "slide-4",
      "slide-5",
    ])
    expect(loaded.slides.map((slide) => slide.bytes.byteLength)).toEqual(
      fixture.slideBytes.map((bytes) => bytes.byteLength),
    )
  })

  it("rejects a stale revision", async () => {
    const fixture = await createApprovedRunFixture()

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision + 1))
      .rejects.toMatchObject({ code: "STALE_REVISION" })
  })

  it("rejects a manifest that is not approved", async () => {
    const fixture = await createApprovedRunFixture({ status: "draft" })

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision))
      .rejects.toMatchObject({ code: "NOT_APPROVED" })
  })

  it("rejects a manifest whose declared ID differs from the requested run", async () => {
    const fixture = await createApprovedRunFixture({ manifestId: "other-run" })

    await expectArtifactValidationError(
      new FileSystemCarouselArtifactStore(fixture.artifactRoot)
        .loadApprovedRun(fixture.requestedRunId, fixture.run.revision),
      "INVALID_MANIFEST",
    )
  })

  it("rejects a storage key that escapes the artifact root", async () => {
    const fixture = await createApprovedRunFixture({ storageKey: "../escape.png" })
    await writeFile(path.join(fixture.temporaryDirectory, "escape.png"), fixture.slideBytes[0])

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision))
      .rejects.toMatchObject({ code: "INVALID_ASSET_PATH" })
  })

  it("rejects a storage key inside the artifact root but outside the requested run", async () => {
    const fixture = await createApprovedRunFixture({ storageKeyRoot: "other-run" })

    await expectArtifactValidationError(
      new FileSystemCarouselArtifactStore(fixture.artifactRoot)
        .loadApprovedRun(fixture.requestedRunId, fixture.run.revision),
      "INVALID_ASSET_PATH",
    )
  })

  it("rejects a checksum mismatch", async () => {
    const fixture = await createApprovedRunFixture({ checksum: "0".repeat(64) })

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision))
      .rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" })
  })

  it("rejects a missing slide", async () => {
    const fixture = await createApprovedRunFixture()
    await rm(path.join(fixture.artifactRoot, fixture.run.slides[4].storageKey))

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision))
      .rejects.toMatchObject({ code: "ASSET_MISSING" })
  })

  it.each([
    ["caption", "   "],
    ["documentTitle", "\t\n"],
  ] as const)("rejects a manifest whose %s is only whitespace", async (field, value) => {
    const fixture = await createApprovedRunFixture({ [field]: value })

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision))
      .rejects.toMatchObject({ code: "INVALID_MANIFEST" })
  })

  it("normalizes surrounding whitespace in the approved title and caption", async () => {
    const fixture = await createApprovedRunFixture({
      caption: "  A practical lesson from the field.  ",
      documentTitle: "  Reliable carousels  ",
    })

    const loaded = await new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.run.id, fixture.run.revision)

    expect(loaded.run.caption).toBe("A practical lesson from the field.")
    expect(loaded.run.documentTitle).toBe("Reliable carousels")
  })

  it("rejects a manifest before reading beyond its size limit", async () => {
    const fixture = await createApprovedRunFixture()
    const manifestPath = path.join(fixture.artifactRoot, fixture.requestedRunId, "manifest.json")
    await writeFile(manifestPath, Buffer.alloc(MAX_CAROUSEL_MANIFEST_BYTES + 1, 0x20))

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.requestedRunId, fixture.run.revision))
      .rejects.toMatchObject({ code: "INVALID_MANIFEST" })
  })

  it("rejects a slide before reading beyond its per-file size limit", async () => {
    const fixture = await createApprovedRunFixture()
    const bytes = Buffer.alloc(MAX_CAROUSEL_SLIDE_BYTES + 1, 0x61)
    const slide = fixture.run.slides[0]
    slide.checksum = createHash("sha256").update(bytes).digest("hex")
    await writeFile(path.join(fixture.artifactRoot, slide.storageKey), bytes)
    await writeFile(
      path.join(fixture.artifactRoot, fixture.requestedRunId, "manifest.json"),
      JSON.stringify(fixture.run),
    )

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.requestedRunId, fixture.run.revision))
      .rejects.toMatchObject({ code: "ASSET_TOO_LARGE" })
  })

  it("rejects a non-regular slide without reading it", async () => {
    const fixture = await createApprovedRunFixture()
    const slidePath = path.join(fixture.artifactRoot, fixture.run.slides[0].storageKey)
    await rm(slidePath)
    await mkdir(slidePath)

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.requestedRunId, fixture.run.revision))
      .rejects.toMatchObject({ code: "INVALID_ASSET_PATH" })
  })

  it("rejects a run-directory junction that redirects outside the artifact root", async () => {
    const fixture = await createApprovedRunFixture()
    const runDirectory = path.join(fixture.artifactRoot, fixture.requestedRunId)
    const outsideRun = path.join(fixture.temporaryDirectory, "outside-run")
    await mkdir(outsideRun)
    await writeFile(path.join(outsideRun, "manifest.json"), JSON.stringify(fixture.run))
    await rm(runDirectory, { recursive: true })
    await symlink(outsideRun, runDirectory, process.platform === "win32" ? "junction" : "dir")

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.requestedRunId, fixture.run.revision))
      .rejects.toMatchObject({ code: "INVALID_ASSET_PATH" })
  })

  it("rejects a nested slides junction even when its storage key is lexically contained", async () => {
    const fixture = await createApprovedRunFixture()
    const slidesDirectory = path.join(fixture.artifactRoot, fixture.requestedRunId, "slides")
    const outsideSlides = path.join(fixture.temporaryDirectory, "outside-slides")
    await mkdir(outsideSlides)
    await writeFile(path.join(outsideSlides, "01.png"), fixture.slideBytes[0])
    await rm(slidesDirectory, { recursive: true })
    await symlink(outsideSlides, slidesDirectory, process.platform === "win32" ? "junction" : "dir")

    await expect(new FileSystemCarouselArtifactStore(fixture.artifactRoot)
      .loadApprovedRun(fixture.requestedRunId, fixture.run.revision))
      .rejects.toMatchObject({ code: "INVALID_ASSET_PATH" })
  })
})

interface FixtureOverrides {
  manifestId?: string
  status?: string
  storageKey?: string
  storageKeyRoot?: string
  checksum?: string
  caption?: string
  documentTitle?: string
}

async function expectArtifactValidationError(promise: Promise<unknown>, code: string) {
  try {
    await promise
  } catch (error) {
    expect(error).toMatchObject({ code })
    return
  }

  throw new Error(`Expected artifact validation error ${code}`)
}

async function createApprovedRunFixture(overrides: FixtureOverrides = {}) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "carousel-artifact-store-"))
  temporaryDirectories.push(temporaryDirectory)

  const artifactRoot = path.join(temporaryDirectory, "artifacts")
  const requestedRunId = "run-123"
  const run = {
    id: overrides.manifestId ?? requestedRunId,
    revision: 3,
    status: overrides.status ?? "approved",
    caption: overrides.caption ?? "A practical lesson from the field.",
    documentTitle: overrides.documentTitle ?? "Reliable carousels",
    slides: await Promise.all([1, 2, 3, 4, 5].map(async (index) => {
      const storageKey = overrides.storageKey ?? `${overrides.storageKeyRoot ?? requestedRunId}/slides/0${index}.png`
      const bytes = create1080SquarePng(index)
      const checksum = overrides.checksum ?? createHash("sha256").update(bytes).digest("hex")
      await mkdir(path.dirname(path.join(artifactRoot, storageKey)), { recursive: true })
      await writeFile(path.join(artifactRoot, storageKey), bytes)

      return {
        id: `slide-${index}`,
        index,
        storageKey,
        mimeType: "image/png",
        width: 1080,
        height: 1080,
        altText: `Slide ${index}`,
        checksum,
      }
    })),
  }
  await mkdir(path.join(artifactRoot, requestedRunId), { recursive: true })
  await writeFile(path.join(artifactRoot, requestedRunId, "manifest.json"), JSON.stringify(run))

  return {
    artifactRoot,
    requestedRunId,
    run,
    slideBytes: run.slides.map((slide) => create1080SquarePng(slide.index)),
    temporaryDirectory,
  }
}

function create1080SquarePng(color: number): Buffer {
  const signature = Buffer.from("89504e470d0a1a0a", "hex")
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1080, 0)
  header.writeUInt32BE(1080, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc((1080 * 4 + 1) * 1080)
  for (let row = 0; row < 1080; row += 1) {
    const offset = row * (1080 * 4 + 1)
    pixels[offset + 1] = color
    pixels[offset + 2] = color
    pixels[offset + 3] = color
    pixels[offset + 4] = 255
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 4, "ascii")
  data.copy(chunk, 8)
  chunk.writeUInt32BE(0, 8 + data.length)
  return chunk
}
