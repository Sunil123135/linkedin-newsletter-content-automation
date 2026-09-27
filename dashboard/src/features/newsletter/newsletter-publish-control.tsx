"use client"

import { useState } from "react"
import { CheckCircle2Icon, LoaderCircleIcon, SendIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ExecutionStatus } from "@/features/automation/types"

type PublishState = "idle" | "confirming" | "publishing" | "success" | "error"

export function NewsletterPublishControl({
  reviewReady,
  onStatusChange,
}: {
  reviewReady: boolean
  onStatusChange?: (status: ExecutionStatus) => void
}) {
  const [state, setState] = useState<PublishState>("idle")
  const [error, setError] = useState("")

  async function publish() {
    setState("publishing")
    setError("")
    onStatusChange?.("running")

    try {
      const response = await fetch("/api/newsletter/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newsletterId: "issue-014" }),
      })
      const body = (await response.json()) as { error?: unknown }
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Publishing failed. Please try again."
        )
      }

      setState("success")
      onStatusChange?.("completed")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publishing failed. Please try again.")
      setState("error")
      onStatusChange?.("error")
    }
  }

  if (!reviewReady) {
    return (
      <p className="text-sm text-muted-foreground">
        Complete editorial review to unlock publishing.
      </p>
    )
  }

  if (state === "success") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-chart-2" role="status">
        <CheckCircle2Icon className="size-4" /> Newsletter published successfully.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {state === "error" ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <TriangleAlertIcon className="size-4" /> {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={() => setState("confirming")}
        disabled={state === "publishing"}
      >
        <SendIcon /> {state === "error" ? "Try publishing again" : "Publish newsletter"}
      </Button>

      <Dialog open={state === "confirming" || state === "publishing"} onOpenChange={(open) => {
        if (!open && state !== "publishing") setState("idle")
      }}>
        <DialogContent role="alertdialog" showCloseButton={state !== "publishing"}>
          <DialogHeader>
            <DialogTitle>Publish this newsletter?</DialogTitle>
            <DialogDescription>
              This sends the approved issue to the fixed test recipient configured on the server.
              The recipient cannot be changed here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={state === "publishing"} />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              onClick={() => void publish()}
              disabled={state === "publishing"}
              aria-label={state === "publishing" ? "Publishing…" : "Confirm publish"}
            >
              {state === "publishing" ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
              {state === "publishing" ? "Publishing…" : "Confirm publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
