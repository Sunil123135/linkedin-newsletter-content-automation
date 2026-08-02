import { deflateSync } from "node:zlib"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import type { LoadedCarouselSlide } from "../carousel-artifacts/artifact-store"
import { buildCarouselPdf } from "./pdf-builder"

describe("buildCarouselPdf", () => {
  it("creates a PDF with exactly five square pages in manifest order", async () => {
    const pdf = await buildCarouselPdf(createSlides())
    const parsed = await PDFDocument.load(pdf)

    expect(parsed.getPageCount()).toBe(5)
    expect(parsed.getPages().map((page) => page.getSize())).toEqual([
      { width: 1080, height: 1080 },
      { width: 1080, height: 1080 },
      { width: 1080, height: 1080 },
      { width: 1080, height: 1080 },
      { width: 1080, height: 1080 },
    ])
  })

  it("returns identical bytes for identical slide input", async () => {
    const slides = createSlides()

    await expect(buildCarouselPdf(slides)).resolves.toEqual(await buildCarouselPdf(slides))
  })

  it("rejects fewer or more than five slides", async () => {
    await expect(buildCarouselPdf(createSlides([1, 2, 3, 4]))).rejects.toThrow(/exactly five/)
    await expect(buildCarouselPdf(createSlides([1, 2, 3, 4, 5, 6]))).rejects.toThrow(/exactly five/)
  })

  it("rejects duplicate or unordered indexes", async () => {
    await expect(buildCarouselPdf(createSlides([1, 2, 2, 4, 5]))).rejects.toThrow(/ordered 1 through 5/)
    await expect(buildCarouselPdf(createSlides([1, 3, 2, 4, 5]))).rejects.toThrow(/ordered 1 through 5/)
  })

  it("rejects bytes that do not match the declared MIME type", async () => {
    const slides = createSlides()
    slides[0] = { ...slides[0], asset: { ...slides[0].asset, mimeType: "image/jpeg" } }

    await expectRejection(buildCarouselPdf(slides))
  })

  it("rejects image bytes whose encoded dimensions are not 1080 by 1080", async () => {
    const slides = createSlides()
    slides[0] = { ...slides[0], bytes: createPng(640, 1080, 1) }

    await expect(buildCarouselPdf(slides)).rejects.toThrow(/1080 by 1080/)
  })

  it("rejects a generated PDF larger than LinkedIn's 100 MB document limit", async () => {
    const slides = [1, 2, 3, 4, 5].map((index) => createSlide(index, createJpeg(1080, 1080, 21 * 1024 * 1024)))

    await expect(buildCarouselPdf(slides)).rejects.toThrow(/100 MB/)
  }, 30_000)
})

function createSlides(indexes = [1, 2, 3, 4, 5]): LoadedCarouselSlide[] {
  return indexes.map((index) => createSlide(
    index,
    index % 2 === 0 ? createJpeg(1080, 1080) : createPng(1080, 1080, index),
  ))
}

async function expectRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeDefined()
    return
  }

  throw new Error("Expected promise to reject")
}

function createSlide(index: number, bytes: Uint8Array): LoadedCarouselSlide {
  const mimeType = bytes[0] === 0xff ? "image/jpeg" : "image/png"

  return {
    asset: {
      id: `slide-${index}`,
      index: index as 1 | 2 | 3 | 4 | 5,
      storageKey: `run-123/slides/${index}`,
      mimeType,
      width: 1080,
      height: 1080,
      altText: `Slide ${index}`,
      checksum: "0".repeat(64),
    },
    bytes,
  }
}

function createPng(width: number, height: number, color: number): Uint8Array {
  const signature = Buffer.from("89504e470d0a1a0a", "hex")
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const pixels = Buffer.alloc((width * 4 + 1) * height)
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 4 + 1)
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

function createJpeg(width: number, height: number, paddingLength = 0): Uint8Array {
  const quantizationTable = Buffer.concat([
    Buffer.from([0xff, 0xdb, 0x00, 0x43, 0x00]),
    Buffer.alloc(64, 1),
  ])
  const startOfFrame = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    height >> 8, height & 0xff,
    width >> 8, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ])
  const huffmanTables = Buffer.from([
    0xff, 0xc4, 0x00, 0x26,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ])
  const startOfScan = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8)
  const entropyData = Buffer.alloc(Math.ceil((blocks * 2) / 8), 0)
  if ((blocks * 2) % 8 !== 0) entropyData[entropyData.length - 1] = 0x3f

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...createApplicationPadding(paddingLength),
    quantizationTable,
    startOfFrame,
    huffmanTables,
    startOfScan,
    entropyData,
    Buffer.from([0xff, 0xd9]),
  ])
}

function createApplicationPadding(length: number): Buffer[] {
  const segments: Buffer[] = []
  let remaining = length
  while (remaining > 0) {
    const segmentLength = Math.min(remaining, 65_533)
    const segment = Buffer.alloc(segmentLength + 4)
    segment[0] = 0xff
    segment[1] = 0xe2
    segment.writeUInt16BE(segmentLength + 2, 2)
    segments.push(segment)
    remaining -= segmentLength
  }

  return segments
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 4, "ascii")
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length)
  return chunk
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}
