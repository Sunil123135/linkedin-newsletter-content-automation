"use client"

import { LoaderCircleIcon, PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { WorkflowKind } from "@/features/automation/types"

export function SiteHeader({
  workflow,
  isRunning,
  onRun,
}: {
  workflow: WorkflowKind
  isRunning: boolean
  onRun: () => void
}) {
  const title = workflow === "newsletter" ? "Newsletter" : "LinkedIn Carousel Automation"

  return (
    <header className="sticky top-0 z-30 flex min-h-(--header-height) shrink-0 items-center border-b bg-background/90 backdrop-blur-lg">
      <div className="flex w-full items-center gap-1 px-4 py-2 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Workflow workspace
          </p>
          <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
        </div>
        <Button type="button" size="sm" onClick={onRun} disabled={isRunning}>
          {isRunning ? <LoaderCircleIcon className="animate-spin" /> : <PlayIcon />}
          {isRunning ? "Running…" : "Run Workflow"}
        </Button>
      </div>
    </header>
  )
}
