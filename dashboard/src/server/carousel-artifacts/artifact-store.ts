import { createHash } from "node:crypto"
import { constants, type Stats } from "node:fs"
import {
  lstat,
  open,
  realpath,
  type FileHandle,
} from "node:fs/promises"
import path from "node:path"

import {
  approvedCarouselRunSchema,
  type ApprovedCarouselRun,
  type CarouselSlideAsset,
} from "./approved-run"

export const MAX_CAROUSEL_MANIFEST_BYTES = 256 * 1024
export const MAX_CAROUSEL_SLIDE_BYTES = 16 * 1024 * 1024

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
      | "ASSET_TOO_LARGE"
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
    if (!artifactRoot) throw new Error("CAROUSEL_ARTIFACT_ROOT must be configured")
    this.resolvedArtifactRoot = path.resolve(artifactRoot)
  }

  async loadApprovedRun(runId: string, revision: number): Promise<LoadedApprovedCarouselRun> {
    const artifactRoot = await this.loadTrustedRoot()
    const runDirectory = resolveContainedPath(runId, artifactRoot, artifactRoot)
    try {
      await assertDirectoryChain(artifactRoot, runDirectory)
    } catch (error) {
      if (error instanceof UnsafeArtifactPathError) {
        throw new ArtifactValidationError("INVALID_ASSET_PATH", error.message)
      }
      if (isFileSystemError(error, "ENOENT")) {
        throw new ArtifactValidationError("RUN_NOT_FOUND", "The requested carousel run was not found")
      }
      throw error
    }
    const manifest = await this.loadManifest(
      path.join(runDirectory, "manifest.json"),
      artifactRoot,
      runDirectory,
    )

    if (manifest.id !== runId) {
      throw new ArtifactValidationError(
        "INVALID_MANIFEST",
        "The carousel manifest ID does not match the requested run",
      )
    }
    if (manifest.revision !== revision) {
      throw new ArtifactValidationError(
        "STALE_REVISION",
        `Run ${runId} does not have revision ${revision}`,
      )
    }

    const slides: LoadedCarouselSlide[] = []
    for (const asset of manifest.slides) {
      slides.push({
        asset,
        bytes: await this.loadSlide(asset, artifactRoot, runDirectory),
      })
    }
    return { run: manifest, slides }
  }

  private async loadTrustedRoot(): Promise<string> {
    let rootStats: Stats
    try {
      rootStats = await lstat(this.resolvedArtifactRoot)
    } catch (error) {
      if (isFileSystemError(error, "ENOENT")) {
        throw new ArtifactValidationError("RUN_NOT_FOUND", "The artifact root was not found")
      }
      throw new ArtifactValidationError("INVALID_ASSET_PATH", "The artifact root is unavailable")
    }
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      throw new ArtifactValidationError(
        "INVALID_ASSET_PATH",
        "The artifact root must be a real local directory",
      )
    }
    return realpath(this.resolvedArtifactRoot)
  }

  private async loadManifest(
    manifestPath: string,
    artifactRoot: string,
    runDirectory: string,
  ): Promise<ApprovedCarouselRun> {
    let bytes: Uint8Array
    try {
      bytes = await readBoundedRegularFile(
        manifestPath,
        artifactRoot,
        runDirectory,
        MAX_CAROUSEL_MANIFEST_BYTES,
      )
    } catch (error) {
      if (error instanceof UnsafeArtifactPathError) {
        throw new ArtifactValidationError("INVALID_ASSET_PATH", error.message)
      }
      if (error instanceof FileTooLargeError) {
        throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest is too large")
      }
      if (isFileSystemError(error, "ENOENT")) {
        throw new ArtifactValidationError("RUN_NOT_FOUND", "The requested carousel run was not found")
      }
      throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest could not be read")
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(bytes).toString("utf8"))
    } catch {
      throw new ArtifactValidationError("INVALID_MANIFEST", "The carousel manifest is not valid JSON")
    }
    if (isRecord(parsed) && parsed.status !== "approved") {
      throw new ArtifactValidationError("NOT_APPROVED", "The carousel run has not been approved")
    }

    const result = approvedCarouselRunSchema.safeParse(parsed)
    if (!result.success) {
      throw new ArtifactValidationError(
        "INVALID_MANIFEST",
        "The carousel manifest does not match the approved-run contract",
      )
    }
    return result.data
  }

  private async loadSlide(
    asset: CarouselSlideAsset,
    artifactRoot: string,
    runDirectory: string,
  ): Promise<Uint8Array> {
    const assetPath = resolveContainedPath(asset.storageKey, artifactRoot, runDirectory)
    let bytes: Uint8Array
    try {
      bytes = await readBoundedRegularFile(
        assetPath,
        artifactRoot,
        runDirectory,
        MAX_CAROUSEL_SLIDE_BYTES,
      )
    } catch (error) {
      if (error instanceof UnsafeArtifactPathError) {
        throw new ArtifactValidationError("INVALID_ASSET_PATH", error.message)
      }
      if (error instanceof FileTooLargeError) {
        throw new ArtifactValidationError(
          "ASSET_TOO_LARGE",
          `The asset for slide ${asset.index} exceeds the file-size limit`,
        )
      }
      if (isFileSystemError(error, "ENOENT")) {
        throw new ArtifactValidationError("ASSET_MISSING", `The asset for slide ${asset.index} is missing`)
      }
      throw new ArtifactValidationError(
        "ASSET_MISSING",
        `The asset for slide ${asset.index} could not be read`,
      )
    }

    const checksum = createHash("sha256").update(bytes).digest("hex")
    if (checksum !== asset.checksum) {
      throw new ArtifactValidationError(
        "CHECKSUM_MISMATCH",
        `The asset for slide ${asset.index} failed checksum validation`,
      )
    }
    return bytes
  }
}

class UnsafeArtifactPathError extends Error {}
class FileTooLargeError extends Error {}

async function readBoundedRegularFile(
  filePath: string,
  artifactRoot: string,
  containmentDirectory: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  await assertDirectoryChain(artifactRoot, path.dirname(filePath))
  const before = await lstat(filePath)
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new UnsafeArtifactPathError("Artifact files must be regular files, not links or devices")
  }

  const canonicalBefore = await realpath(filePath)
  if (!isPathWithin(canonicalBefore, containmentDirectory)) {
    throw new UnsafeArtifactPathError("The artifact file resolves outside the requested run")
  }

  let handle: FileHandle | undefined
  try {
    const noFollow = process.platform === "linux" ? constants.O_NOFOLLOW : 0
    handle = await open(filePath, constants.O_RDONLY | noFollow)
    const opened = await handle.stat()
    if (!opened.isFile() || !sameFileIdentity(before, opened)) {
      throw new UnsafeArtifactPathError("The artifact file changed while it was being opened")
    }
    if (opened.size > maximumBytes) throw new FileTooLargeError()

    if (process.platform === "linux") {
      const openedPath = await realpath(`/proc/self/fd/${handle.fd}`)
      if (!isPathWithin(openedPath, containmentDirectory)) {
        throw new UnsafeArtifactPathError("The opened artifact resolves outside the requested run")
      }
    }

    const bytes = await readAtMost(handle, maximumBytes)
    const after = await handle.stat()
    if (!after.isFile() || !sameFileIdentity(opened, after)) {
      throw new UnsafeArtifactPathError("The artifact file changed while it was being read")
    }
    return bytes
  } finally {
    await handle?.close()
  }
}

async function readAtMost(handle: FileHandle, maximumBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let total = 0
  while (total <= maximumBytes) {
    const remaining = maximumBytes + 1 - total
    if (remaining === 0) break
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining))
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, total)
    if (bytesRead === 0) break
    chunks.push(chunk.subarray(0, bytesRead))
    total += bytesRead
  }
  if (total > maximumBytes) throw new FileTooLargeError()
  return Buffer.concat(chunks, total)
}

async function assertDirectoryChain(root: string, targetDirectory: string): Promise<void> {
  if (targetDirectory !== root && !isPathWithin(targetDirectory, root)) {
    throw new UnsafeArtifactPathError("The artifact directory is outside the configured root")
  }
  const relative = path.relative(root, targetDirectory)
  let current = root
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    const stats = await lstat(current)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new UnsafeArtifactPathError("Artifact directories must not be links or junctions")
    }
  }
  const canonical = await realpath(targetDirectory)
  if (canonical !== root && !isPathWithin(canonical, root)) {
    throw new UnsafeArtifactPathError("The artifact directory resolves outside the configured root")
  }
}

function resolveContainedPath(
  input: string,
  artifactRoot: string,
  containingDirectory: string,
): string {
  const resolvedPath = path.resolve(artifactRoot, input)
  if (!isPathWithin(resolvedPath, artifactRoot)
    || !isPathWithin(resolvedPath, containingDirectory)) {
    throw new ArtifactValidationError(
      "INVALID_ASSET_PATH",
      "The artifact path must remain within the requested run directory",
    )
  }
  return resolvedPath
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return isRecord(error) && error.code === code
}

function isPathWithin(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate)
  return relative.length > 0
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
}
