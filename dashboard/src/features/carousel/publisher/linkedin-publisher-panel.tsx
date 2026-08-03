"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLinkIcon, LinkIcon, LockKeyholeIcon, SendIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import {
  getLinkedInConnection,
  LinkedInPublisherApiError,
  publishCarousel,
  type LinkedInConnection,
} from "./linkedin-publisher-client"
import { LinkedInPublishDialog } from "./linkedin-publish-dialog"
import type { LinkedInPublisherState, PublishCarouselRequest } from "./linkedin-publisher-state"

export interface LinkedInPublisherPanelProps {
  runId: string | null
  revision: number | null
  artifactReady: boolean
  onStateChange(state: LinkedInPublisherState): void
}

const DOCUMENT_TITLE = "Approved carousel document"

export function LinkedInPublisherPanel({
  runId,
  revision,
  artifactReady,
  onStateChange,
}: LinkedInPublisherPanelProps) {
  const [connection, setConnection] = useState<LinkedInConnection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [postUrl, setPostUrl] = useState<string>()
  const [failure, setFailure] = useState<LinkedInPublisherApiError>()
  const mounted = useRef(true)

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

  const state = publisherState({ connection, artifactReady, publishing, postUrl, failure })

  useEffect(() => {
    onStateChange(state)
  }, [onStateChange, state])

  function startOAuth() {
    window.location.assign("/api/linkedin/oauth/start")
  }

  async function confirmPublish() {
    if (!runId || !revision || !connection?.connected || !artifactReady || publishing) return

    const request: PublishCarouselRequest = {
      runId,
      revision,
      idempotencyKey: crypto.randomUUID(),
    }
    setPublishing(true)
    setFailure(undefined)

    try {
      const result = await publishWithOneTransportRetry(request)
      if (!mounted.current) return
      setPostUrl(result.postUrl)
      setDialogOpen(false)
    } catch (error) {
      if (!mounted.current) return
      const apiError = toSafeApiError(error)
      setFailure(apiError)
      setDialogOpen(false)
      if (apiError.code === "AUTH_REQUIRED" || apiError.code === "INSUFFICIENT_SCOPE") {
        setConnection({ connected: false, reconnectRequired: true })
      }
    } finally {
      if (mounted.current) setPublishing(false)
    }
  }

  const action = actionFor({ connection, artifactReady, runId, revision, publishing, postUrl, failure })

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

        {!artifactReady && connection !== null ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground"><LockKeyholeIcon className="size-4" /> Publishing locked</p>
            <p className="mt-1">Publishing is locked until an approved carousel artifact is available.</p>
          </div>
        ) : null}

        {failure?.code === "UNKNOWN_OUTCOME" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="alert">
            We could not confirm whether LinkedIn created the post. Check LinkedIn before trying again.
          </div>
        ) : failure ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">
            {failure.message}
          </div>
        ) : null}

        {postUrl ? (
          <a
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            href={postUrl}
            target="_blank"
            rel="noreferrer"
          >
            View LinkedIn post <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}

        {action === "connect" || action === "reconnect" ? (
          <Button type="button" disabled={publishing} onClick={startOAuth}>
            <LinkIcon /> {action === "connect" ? "Connect LinkedIn" : "Reconnect LinkedIn"}
          </Button>
        ) : null}

        {action === "publish" ? (
          <Button type="button" disabled={publishing} onClick={() => setDialogOpen(true)}>
            <SendIcon /> Publish to LinkedIn
          </Button>
        ) : null}
      </CardContent>

      <LinkedInPublishDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connectedProfileName={connection?.displayName ?? "LinkedIn member"}
        documentTitle={DOCUMENT_TITLE}
        publishing={publishing}
        onConfirm={confirmPublish}
      />
    </Card>
  )
}

function actionFor({
  connection,
  artifactReady,
  runId,
  revision,
  publishing,
  postUrl,
  failure,
}: {
  connection: LinkedInConnection | null
  artifactReady: boolean
  runId: string | null
  revision: number | null
  publishing: boolean
  postUrl?: string
  failure?: LinkedInPublisherApiError
}) {
  if (publishing || postUrl || failure?.code === "UNKNOWN_OUTCOME" || connection === null) return null
  if (!connection.connected) return connection.reconnectRequired ? "reconnect" : "connect"
  if (!artifactReady || !runId || !revision) return null
  return "publish"
}

function publisherState({
  connection,
  artifactReady,
  publishing,
  postUrl,
  failure,
}: {
  connection: LinkedInConnection | null
  artifactReady: boolean
  publishing: boolean
  postUrl?: string
  failure?: LinkedInPublisherApiError
}): LinkedInPublisherState {
  if (publishing) return "preparing_pdf"
  if (postUrl) return "published"
  if (failure) return "failed"
  if (!connection?.connected) return "disconnected"
  if (!artifactReady) return "locked"
  return "ready"
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
