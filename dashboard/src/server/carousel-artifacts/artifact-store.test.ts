import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { deflateSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import { FileSystemCarouselArtifactStore } from "./artifact-store"

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
})

interface FixtureOverrides {
  manifestId?: string
  status?: string
  storageKey?: string
  storageKeyRoot?: string
  checksum?: string
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
    caption: "A practical lesson from the field.",
    documentTitle: "Reliable carousels",
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
