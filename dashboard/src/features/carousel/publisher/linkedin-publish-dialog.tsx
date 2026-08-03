"use client"

import { useState } from "react"
import Image from "next/image"

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
  caption: string
  pages: ReadonlyArray<{
    index: number
    altText: string
    previewUrl: string
  }>
  publishing: boolean
  onConfirm(): Promise<void>
}

export function LinkedInPublishDialog({
  open,
  onOpenChange,
  connectedProfileName,
  documentTitle,
  caption,
  pages,
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

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Caption</p>
          <p className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap">{caption}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Validated pages</p>
          <div className="grid grid-cols-5 gap-2">
            {pages.map((page) => (
              <figure key={page.index} className="space-y-1">
                <Image
                  className="aspect-square w-full rounded-md border object-cover"
                  src={page.previewUrl}
                  width={216}
                  height={216}
                  alt={page.altText}
                  unoptimized
                />
                <figcaption className="text-center text-[10px] text-muted-foreground">
                  Page {page.index}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

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
