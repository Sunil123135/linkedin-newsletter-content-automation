import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  approvedCarouselRunSchema,
  type ApprovedCarouselRun,
  type CarouselSlideAsset,
} from "./approved-run"

export interface LoadedCarouselSlide {
  asset: CarouselSlideAsset
  bytes: Uint8Array
}

export interface LoadedApprovedCarouselRun {
  run: ApprovedCarouselRun
  slides: LoadedCarouselSlide[]
}

export interface CarouselArtifactStore {
  loadApprovedRun(runId: string, revision: number): Promise<LoadedApprovedCarouselRun>
}

export class ArtifactValidationError extends Error {
  constructor(
    public readonly code:
      | "RUN_NOT_FOUND"
      | "STALE_REVISION"
      | "NOT_APPROVED"
      | "INVALID_MANIFEST"
      | "INVALID_ASSET_PATH"
      | "ASSET_MISSING"
      | "CHECKSUM_MISMATCH",
    message: string,
  ) {
    super(message)
    this.name = "ArtifactValidationError"
  }
}

export class FileSystemCarouselArtifactStore implements CarouselArtifactStore {
  private readonly resolvedArtifactRoot: string

  constructor(artifactRoot = process.env.CAROUSEL_ARTIFACT_ROOT) {
    if (!artifactRoot) {
      throw new Error("CAROUSEL_ARTIFACT_ROOT must be configured")
    }

    this.resolvedArtifactRoot = path.resolve(artifactRoot)
  }

  async loadApprovedRun(runId: string, revision: number): Promise<LoadedApprovedCarouselRun> {
    const runDirectory = this.resolveContainedPath(runId)
    const manifest = await this.loadManifest(path.join(runDirectory, "manifest.json"))

    if (manifest.id !== runId) {
      throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest ID does not match the requested run")
    }

    if (manifest.revision !== revision) {
      throw new ArtifactValidationError("STALE_REVISION", `Run ${runId} does not have revision ${revision}`)
    }

    const slides = await Promise.all(manifest.slides.map(async (asset) => ({
      asset,
      bytes: await this.loadSlide(asset, runDirectory),
    })))

    return { run: manifest, slides }
  }

  private async loadManifest(manifestPath: string): Promise<ApprovedCarouselRun> {
    let contents: string
    try {
      contents = await readFile(manifestPath, "utf8")
    } catch (error) {
      if (isMissingFile(error)) {
        throw new ArtifactValidationError("RUN_NOT_FOUND", "The requested carousel run was not found")
      }
      throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest could not be read")
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest is not valid JSON")
    }

    if (isRecord(parsed) && parsed.status !== "approved") {
      throw new ArtifactValidationError("NOT_APPROVED", "The carousel run has not been approved")
    }

    const result = approvedCarouselRunSchema.safeParse(parsed)
    if (!result.success) {
      throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest does not match the approved-run contract")
    }

    return result.data
  }

  private async loadSlide(asset: CarouselSlideAsset, runDirectory: string): Promise<Uint8Array> {
    const assetPath = this.resolveContainedPath(asset.storageKey, runDirectory)
    let bytes: Uint8Array
    try {
      bytes = await readFile(assetPath)
    } catch (error) {
      if (isMissingFile(error)) {
        throw new ArtifactValidationError("ASSET_MISSING", `The asset for slide ${asset.index} is missing`)
      }
      throw new ArtifactValidationError("ASSET_MISSING", `The asset for slide ${asset.index} could not be read`)
    }

    const checksum = createHash("sha256").update(bytes).digest("hex")
    if (checksum !== asset.checksum) {
      throw new ArtifactValidationError("CHECKSUM_MISMATCH", `The asset for slide ${asset.index} failed checksum validation`)
    }

    return bytes
  }

  private resolveContainedPath(input: string, containingDirectory = this.resolvedArtifactRoot): string {
    const resolvedPath = path.resolve(this.resolvedArtifactRoot, input)
    if (!isPathWithin(resolvedPath, this.resolvedArtifactRoot)
      || !isPathWithin(resolvedPath, containingDirectory)) {
      throw new ArtifactValidationError("INVALID_ASSET_PATH", "The artifact path must remain within the requested run directory")
    }

    return resolvedPath
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return isRecord(error) && error.code === "ENOENT"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPathWithin(resolvedPath: string, resolvedDirectory: string): boolean {
  return resolvedPath.startsWith(`${resolvedDirectory}${path.sep}`)
}
