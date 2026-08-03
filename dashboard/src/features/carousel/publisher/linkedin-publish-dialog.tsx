"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface LinkedInPublishDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  connectedProfileName: string
  documentTitle: string
  publishing: boolean
  onConfirm(): Promise<void>
}

export function LinkedInPublishDialog({
  open,
  onOpenChange,
  connectedProfileName,
  documentTitle,
  publishing,
  onConfirm,
}: LinkedInPublishDialogProps) {
  const [confirming, setConfirming] = useState(false)
  const busy = publishing || confirming

  async function confirm() {
    if (busy) return
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen)
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Final confirmation
          </p>
          <DialogTitle>Publish carousel to LinkedIn</DialogTitle>
          <DialogDescription>
            Review the publication details before creating a public post.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Profile</dt>
            <dd className="font-medium">{connectedProfileName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Document</dt>
            <dd className="text-right font-medium">{documentTitle}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Format</dt>
            <dd className="font-medium">5-page PDF</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Visibility</dt>
            <dd className="font-medium">Public</dd>
          </div>
        </dl>

        <p className="text-sm font-medium text-foreground">
          Clicking Publish document creates a real public LinkedIn post.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Publishing document" : "Publish document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
