"use client"

import { useMemo, useState } from "react"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

import { PipelineBoard } from "./pipeline-board"
import { filterPipelineItems, pipelineItems } from "./pipeline-data"
import { PipelineFilters } from "./pipeline-filters"
import type { ContentTypeFilter } from "./types"

export function PipelineWorkspace() {
  const [type, setType] = useState<ContentTypeFilter>("all")
  const visibleItems = useMemo(
    () => filterPipelineItems(pipelineItems, type),
    [type]
  )

  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-(--header-height) shrink-0 items-center border-b bg-background/90 backdrop-blur-lg">
        <div className="flex w-full items-center gap-1 px-4 py-2 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 h-4 data-vertical:self-auto"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Editorial production
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              Content Pipeline
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 py-5 md:py-6">
        <div className="flex flex-col gap-4 px-4 lg:px-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Editorial production
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              Content pipeline
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Follow newsletters and carousel posts from evidence gathering to
              an approved package.
            </p>
          </div>
          <PipelineFilters value={type} onChange={setType} />
        </div>
        <PipelineBoard items={visibleItems} />
      </div>
    </>
  )
}
