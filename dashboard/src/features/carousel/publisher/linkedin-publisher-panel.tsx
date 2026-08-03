"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ExternalLinkIcon, LinkIcon, LockKeyholeIcon, SendIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import {
  getLinkedInConnection,
  getLinkedInPublishStatus,
  getLinkedInPublisherPreflight,
  LinkedInPublisherApiError,
  publishCarousel,
  type LinkedInConnection,
  type LinkedInPublishStatus,
  type LinkedInPublisherPreflight,
} from "./linkedin-publisher-client"
import { LinkedInPublishDialog } from "./linkedin-publish-dialog"
import type { LinkedInPublisherState, PublishCarouselRequest } from "./linkedin-publisher-state"

export interface LinkedInPublisherPanelProps {
  runId: string | null
  revision: number | null
  artifactReady: boolean
  onStateChange(state: LinkedInPublisherState): void
  onConnectionPresentationChange?(presentation: LinkedInConnectionPresentation): void
}

export interface LinkedInConnectionPresentation {
  connected: boolean
  displayName?: string
}

export function LinkedInPublisherPanel({
  runId,
  revision,
  artifactReady,
  onStateChange,
  onConnectionPresentationChange,
}: LinkedInPublisherPanelProps) {
  const executionIdentity = identityFor(runId, revision)
  const [connection, setConnection] = useState<LinkedInConnection | null>(null)
  const [preflight, setPreflight] = useState<LinkedInPublisherPreflight>()
  const [preflightIdentity, setPreflightIdentity] = useState<string | null>(null)
  const [preflightFailure, setPreflightFailure] = useState<LinkedInPublisherApiError>()
  const [publishStatus, setPublishStatus] = useState<LinkedInPublishStatus>()
  const [publishStatusIdentity, setPublishStatusIdentity] = useState<string | null>(null)
  const [publishStatusFailure, setPublishStatusFailure] = useState<LinkedInPublisherApiError>()
  const [dialogIdentity, setDialogIdentity] = useState<string | null>(null)
  const [publishingIdentity, setPublishingIdentity] = useState<string | null>(null)
  const [outcomeIdentity, setOutcomeIdentity] = useState<string | null>(null)
  const [postUrl, setPostUrl] = useState<string>()
  const [failure, setFailure] = useState<LinkedInPublisherApiError>()
  const [rateLimitExpired, setRateLimitExpired] = useState(false)
  const mounted = useRef(true)
  const currentIdentity = useRef(executionIdentity)
  const successStatus = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    currentIdentity.current = executionIdentity
  }, [executionIdentity])

  useEffect(() => {
    mounted.current = true
    void getLinkedInConnection()
      .then((nextConnection) => {
        if (mounted.current) setConnection(nextConnection)
      })
      .catch(() => {
        if (mounted.current) setConnection({ connected: false, reconnectRequired: true })
      })
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const requestIdentity = executionIdentity
    if (!connection?.connected || !artifactReady || !runId || revision === null || !requestIdentity) {
      queueMicrotask(() => {
        if (currentIdentity.current !== requestIdentity) return
        setPreflight(undefined)
        setPreflightIdentity(null)
        setPreflightFailure(undefined)
        setPublishStatus(undefined)
        setPublishStatusIdentity(null)
        setPublishStatusFailure(undefined)
      })
      return
    }

    let cancelled = false
    setPreflight(undefined)
    setPreflightIdentity(null)
    setPreflightFailure(undefined)
    setPublishStatus(undefined)
    setPublishStatusIdentity(null)
    setPublishStatusFailure(undefined)
    void getLinkedInPublisherPreflight(runId, revision)
      .then((result) => {
        if (cancelled || !mounted.current || currentIdentity.current !== requestIdentity) return
        setPreflight(result)
        setPreflightIdentity(requestIdentity)
      })
      .catch((error) => {
        if (cancelled || !mounted.current || currentIdentity.current !== requestIdentity) return
        setPreflightFailure(toSafeApiError(error))
        setPreflightIdentity(requestIdentity)
      })
    void getLinkedInPublishStatus(runId, revision)
      .then((result) => {
        if (cancelled || !mounted.current || currentIdentity.current !== requestIdentity) return
        setPublishStatus(result)
        setPublishStatusIdentity(requestIdentity)
      })
      .catch((error) => {
        if (cancelled || !mounted.current || currentIdentity.current !== requestIdentity) return
        setPublishStatusFailure(toSafeApiError(error))
        setPublishStatusIdentity(requestIdentity)
      })
    return () => {
      cancelled = true
    }
  }, [artifactReady, connection?.connected, executionIdentity, revision, runId])

  useEffect(() => {
    const identityToReset = executionIdentity
    queueMicrotask(() => {
      if (currentIdentity.current !== identityToReset) return
      setDialogIdentity(null)
      setPublishingIdentity(null)
      setOutcomeIdentity(null)
      setPostUrl(undefined)
      setFailure(undefined)
      setRateLimitExpired(false)
    })
  }, [executionIdentity])

  const hasScopedIdentity = executionIdentity !== null
  const scopedPreflight = hasScopedIdentity && preflightIdentity === executionIdentity
    ? preflight
    : undefined
  const scopedPreflightFailure = hasScopedIdentity && preflightIdentity === executionIdentity
    ? preflightFailure
    : undefined
  const scopedPublishStatus = hasScopedIdentity && publishStatusIdentity === executionIdentity
    ? publishStatus
    : undefined
  const scopedPublishStatusFailure = hasScopedIdentity && publishStatusIdentity === executionIdentity
    ? publishStatusFailure
    : undefined
  const scopedPostUrl = hasScopedIdentity && outcomeIdentity === executionIdentity ? postUrl : undefined
  const scopedFailure = hasScopedIdentity && outcomeIdentity === executionIdentity ? failure : undefined
  const effectivePostUrl = scopedPostUrl ?? (
    scopedPublishStatus?.state === "published" ? scopedPublishStatus.postUrl : undefined
  )
  const publishing = hasScopedIdentity && publishingIdentity === executionIdentity
  const dialogOpen = hasScopedIdentity && dialogIdentity === executionIdentity
  const recovery = recoveryFor(scopedFailure)
  const rateLimitDelay = positiveRetryAfterSeconds(scopedFailure?.retryAfterSeconds)

  useEffect(() => {
    if (scopedFailure?.code !== "RATE_LIMITED" || rateLimitDelay === undefined) return

    const timeout = window.setTimeout(() => setRateLimitExpired(true), rateLimitDelay * 1_000)
    return () => window.clearTimeout(timeout)
  }, [executionIdentity, rateLimitDelay, scopedFailure?.code])

  const state = publisherState({
    connection,
    preflightReady: scopedPreflight !== undefined,
    artifactReady,
    hasExecutionIdentity: executionIdentity !== null,
    publishing,
    postUrl: effectivePostUrl,
    publishStatus: scopedPublishStatus,
    failure: scopedFailure ?? scopedPublishStatusFailure,
  })

  useEffect(() => {
    onStateChange(state)
  }, [onStateChange, state])

  useEffect(() => {
    onConnectionPresentationChange?.(connectionPresentationFor(connection))
  }, [connection, onConnectionPresentationChange])

  useEffect(() => {
    if (effectivePostUrl) successStatus.current?.focus()
  }, [effectivePostUrl])

  function startOAuth() {
    window.location.assign("/api/linkedin/oauth/start")
  }

  async function confirmPublish() {
    if (!runId || !revision || !executionIdentity || !connection?.connected || !scopedPreflight || publishing) return

    const requestIdentity = executionIdentity
    const request: PublishCarouselRequest = {
      runId,
      revision,
      artifactChecksum: scopedPreflight.artifactChecksum,
      idempotencyKey: crypto.randomUUID(),
    }
    setPublishingIdentity(requestIdentity)
    setOutcomeIdentity(null)
    setFailure(undefined)
    setPostUrl(undefined)
    setRateLimitExpired(false)

    try {
      const result = await publishWithOneTransportRetry(request)
      if (!mounted.current || currentIdentity.current !== requestIdentity) return
      setOutcomeIdentity(requestIdentity)
      setPostUrl(result.postUrl)
      setDialogIdentity(null)
    } catch (error) {
      if (!mounted.current || currentIdentity.current !== requestIdentity) return
      const apiError = toSafeApiError(error)
      setOutcomeIdentity(requestIdentity)
      setFailure(apiError)
      setDialogIdentity(null)
      if (apiError.code === "AUTH_REQUIRED" || apiError.code === "INSUFFICIENT_SCOPE") {
        setConnection({ connected: false, reconnectRequired: true })
      }
    } finally {
      if (mounted.current && currentIdentity.current === requestIdentity) {
        setPublishingIdentity(null)
      }
    }
  }

  const action = actionFor({
    connection,
    preflightReady: scopedPreflight !== undefined,
    hasExecutionIdentity: executionIdentity !== null,
    publishing,
    postUrl: effectivePostUrl,
    publishStatus: scopedPublishStatus,
    recovery,
  })
  const lockReason = !artifactReady
    ? "Publishing is locked until an approved carousel artifact is available."
    : executionIdentity === null
      ? "Publishing is locked until an approved run and revision are available."
      : scopedPreflightFailure?.code === "STALE_REVISION"
        ? "This carousel revision is stale. Rerun and approve the current revision before publishing."
        : scopedPreflightFailure
          ? "Publishing is locked because the approved artifact could not be validated."
          : scopedPublishStatusFailure
            ? "Publishing is locked because the previous publish status could not be verified."
            : scopedPublishStatus?.state === "in_progress"
              ? "A publish attempt is still being reconciled. Refresh after it completes."
              : scopedPublishStatus?.state === "unknown"
                ? "Publishing is locked while the previous post outcome is unknown."
                : connection?.connected && (!scopedPreflight || !scopedPublishStatus)
                  ? "Validating the approved carousel on the server…"
                  : undefined

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Manual publisher
            </p>
            <CardTitle className="mt-1 text-base">LinkedIn document post</CardTitle>
          </div>
          <Badge variant="outline">Public</Badge>
        </div>
        <CardDescription>Publish an approved five-page carousel as a LinkedIn document.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {connection === null ? (
          <p className="text-sm text-muted-foreground" role="status">Checking LinkedIn connection…</p>
        ) : null}

        {connection?.connected ? (
          <p className="text-sm font-medium">Connected as {connection.displayName ?? "LinkedIn member"}</p>
        ) : null}

        {lockReason && connection !== null ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground"><LockKeyholeIcon className="size-4" /> Publishing locked</p>
            <p className="mt-1">{lockReason}</p>
          </div>
        ) : null}

        {scopedFailure?.code === "UNKNOWN_OUTCOME" || scopedPublishStatus?.state === "unknown" ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground" role="alert">
            We could not confirm whether LinkedIn created the post. Check LinkedIn before trying again.
          </div>
        ) : scopedFailure ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">
            {recovery.message ?? scopedFailure.message}
          </div>
        ) : null}

        <div
          ref={successStatus}
          className="outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50"
          role="status"
          aria-label="LinkedIn publish status"
          aria-live="polite"
          tabIndex={-1}
        >
          {effectivePostUrl ? (
            <p className="text-sm">
              <span className="font-medium">Published successfully.</span>{" "}
              <a
                className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
                href={effectivePostUrl}
                target="_blank"
                rel="noreferrer"
              >
                View LinkedIn post <ExternalLinkIcon className="size-3.5" />
              </a>
            </p>
          ) : null}
        </div>

        {action === "connect" || action === "reconnect" ? (
          <Button type="button" disabled={publishing} onClick={startOAuth}>
            <LinkIcon /> {action === "connect" ? "Connect LinkedIn" : "Reconnect LinkedIn"}
          </Button>
        ) : null}

        {action === "publish" ? (
          <Button type="button" disabled={publishing} onClick={() => setDialogIdentity(executionIdentity)}>
            <SendIcon /> Publish to LinkedIn
          </Button>
        ) : null}

        {action === "retry" || action === "rateRetry" ? (
          <Button
            type="button"
            disabled={action === "rateRetry" && rateLimitDelay !== undefined && !rateLimitExpired}
            onClick={() => setDialogIdentity(executionIdentity)}
          >
            <SendIcon /> {action === "rateRetry" && rateLimitDelay !== undefined && !rateLimitExpired
              ? `Retry Publish in ${rateLimitDelay}s`
              : "Retry Publish"}
          </Button>
        ) : null}
      </CardContent>

      <LinkedInPublishDialog
        open={dialogOpen}
        onOpenChange={(open) => setDialogIdentity(open ? executionIdentity : null)}
        connectedProfileName={connection?.displayName ?? "LinkedIn member"}
        documentTitle={scopedPreflight?.documentTitle ?? "Approved carousel document"}
        caption={scopedPreflight?.caption ?? ""}
        pages={scopedPreflight?.pages ?? []}
        publishing={publishing}
        onConfirm={confirmPublish}
      />
    </Card>
  )
}

function actionFor({
  connection,
  preflightReady,
  hasExecutionIdentity,
  publishing,
  postUrl,
  publishStatus,
  recovery,
}: {
  connection: LinkedInConnection | null
  preflightReady: boolean
  hasExecutionIdentity: boolean
  publishing: boolean
  postUrl?: string
  publishStatus?: LinkedInPublishStatus
  recovery: RecoveryPolicy
}) {
  if (publishing || postUrl || connection === null) return null
  if (!connection.connected) return connection.reconnectRequired ? "reconnect" : "connect"
  if (!preflightReady || !hasExecutionIdentity || !publishStatus) return null
  if (publishStatus.state !== "idle" && publishStatus.state !== "retry_safe") return null
  if (recovery.action === "retry") return "retry"
  if (recovery.action === "rateRetry") return "rateRetry"
  if (recovery.blocksPublish) return null
  return "publish"
}

function connectionPresentationFor(
  connection: LinkedInConnection | null,
): LinkedInConnectionPresentation {
  if (!connection?.connected) return { connected: false }
  return {
    connected: true,
    ...(connection.displayName ? { displayName: connection.displayName } : {}),
  }
}

function publisherState({
  connection,
  preflightReady,
  artifactReady,
  hasExecutionIdentity,
  publishing,
  postUrl,
  publishStatus,
  failure,
}: {
  connection: LinkedInConnection | null
  preflightReady: boolean
  artifactReady: boolean
  hasExecutionIdentity: boolean
  publishing: boolean
  postUrl?: string
  publishStatus?: LinkedInPublishStatus
  failure?: LinkedInPublisherApiError
}): LinkedInPublisherState {
  if (publishing) return "preparing_pdf"
  if (postUrl) return "published"
  if (failure?.code === "STALE_REVISION" || failure?.code === "INVALID_ARTIFACT") return "locked"
  if (failure) return "failed"
  if (!connection?.connected) return "disconnected"
  if (!artifactReady || !hasExecutionIdentity || !preflightReady || !publishStatus) return "locked"
  if (publishStatus.state === "in_progress" || publishStatus.state === "unknown") return "locked"
  return "ready"
}

interface RecoveryPolicy {
  action?: "retry" | "rateRetry"
  blocksPublish: boolean
  message?: string
}

function recoveryFor(failure?: LinkedInPublisherApiError): RecoveryPolicy {
  if (!failure) return { blocksPublish: false }
  if (failure.code === "AUTH_REQUIRED" || failure.code === "INSUFFICIENT_SCOPE") {
    return { blocksPublish: false }
  }
  if (failure.code === "STALE_REVISION") {
    return {
      blocksPublish: true,
      message: "This carousel revision is stale. Rerun and approve the current revision before publishing.",
    }
  }
  if (failure.code === "INVALID_ARTIFACT") {
    return {
      blocksPublish: true,
      message: "This carousel artifact is no longer publishable. Rerun and approve a real artifact before publishing.",
    }
  }
  if (failure.code === "DUPLICATE_PUBLISH") {
    return {
      blocksPublish: true,
      message: "A post attempt already exists. Refresh or check LinkedIn before publishing again.",
    }
  }
  if (failure.code === "UNKNOWN_OUTCOME") return { blocksPublish: true }
  if (failure.code === "RATE_LIMITED") {
    const delay = positiveRetryAfterSeconds(failure.retryAfterSeconds)
    return {
      action: "rateRetry",
      blocksPublish: false,
      message: delay !== undefined
        ? `LinkedIn asked you to retry in ${delay} seconds.`
        : failure.retryAfterSeconds === 0
          ? "LinkedIn asked you to retry now."
          : "LinkedIn asked you to retry later.",
    }
  }
  if (failure.code === "CONFIGURATION_ERROR") {
    return {
      blocksPublish: true,
      message: "LinkedIn publishing is not configured. Contact an operator to configure it.",
    }
  }
  return { action: "retry", blocksPublish: false }
}

function identityFor(runId: string | null, revision: number | null): string | null {
  if (runId === null || revision === null) return null
  return `${runId}\u0000${revision}`
}

function positiveRetryAfterSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined
}

async function publishWithOneTransportRetry(request: PublishCarouselRequest) {
  try {
    return await publishCarousel(request)
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return publishCarousel(request)
  }
}

function toSafeApiError(error: unknown): LinkedInPublisherApiError {
  if (error instanceof LinkedInPublisherApiError) return error
  return new LinkedInPublisherApiError(
    0,
    "LINKEDIN_UNAVAILABLE",
    "LinkedIn publishing is temporarily unavailable.",
  )
}
