import { PDFDocument } from "pdf-lib"
import type { LoadedCarouselSlide } from "../carousel-artifacts/artifact-store"

const PAGE_SIZE = 1080
const SLIDE_COUNT = 5
const MAX_PDF_BYTES = 100 * 1024 * 1024
const FIXED_METADATA_DATE = new Date("2000-01-01T00:00:00.000Z")

export async function buildCarouselPdf(
  slides: readonly LoadedCarouselSlide[],
): Promise<Uint8Array> {
  assertSlideOrder(slides)

  const document = await PDFDocument.create({ updateMetadata: false })
  document.setTitle("LinkedIn carousel")
  document.setCreator("LinkedIn Carousel PDF Builder")
  document.setProducer("LinkedIn Carousel PDF Builder")
  document.setCreationDate(FIXED_METADATA_DATE)
  document.setModificationDate(FIXED_METADATA_DATE)

  for (const slide of slides) {
    const image = await embedSlide(document, slide)
    if (image.width !== PAGE_SIZE || image.height !== PAGE_SIZE) {
      throw new Error(`Slide ${slide.asset.index} must be encoded at 1080 by 1080 pixels`)
    }

    const page = document.addPage([PAGE_SIZE, PAGE_SIZE])
    page.drawImage(image, { x: 0, y: 0, width: PAGE_SIZE, height: PAGE_SIZE })
  }

  const pdf = await document.save({
    addDefaultPage: false,
    useObjectStreams: false,
    objectsPerTick: Number.POSITIVE_INFINITY,
  })
  if (pdf.byteLength > MAX_PDF_BYTES) {
    throw new Error("The generated PDF exceeds LinkedIn's 100 MB document limit")
  }

  return pdf
}

function assertSlideOrder(slides: readonly LoadedCarouselSlide[]): void {
  if (slides.length !== SLIDE_COUNT) {
    throw new Error("A carousel PDF requires exactly five slides")
  }

  if (slides.some((slide, offset) => slide.asset.index !== offset + 1)) {
    throw new Error("Carousel slides must be ordered 1 through 5 without duplicates")
  }
}

async function embedSlide(document: PDFDocument, slide: LoadedCarouselSlide) {
  const actualMimeType = getEncodedMimeType(slide.bytes)
  if (actualMimeType !== slide.asset.mimeType) {
    throw new Error(`Slide ${slide.asset.index} bytes do not match the declared MIME type`)
  }

  const imageBytes = new Uint8Array(slide.bytes)
  return actualMimeType === "image/png"
    ? document.embedPng(imageBytes)
    : document.embedJpg(imageBytes)
}

function getEncodedMimeType(bytes: Uint8Array): "image/png" | "image/jpeg" | undefined {
  if (isPng(bytes)) return "image/png"
  if (isJpeg(bytes)) return "image/jpeg"
  return undefined
}

function isPng(bytes: Uint8Array): boolean {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return pngSignature.every((byte, index) => bytes[index] === byte)
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}
