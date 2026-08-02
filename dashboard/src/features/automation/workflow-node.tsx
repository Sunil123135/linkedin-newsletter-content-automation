import {
  BrainCircuitIcon,
  CheckIcon,
  ImageIcon,
  LoaderCircleIcon,
  PenLineIcon,
  ScanEyeIcon,
  SearchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import type { ExecutionStatus, WorkflowNodeDefinition } from "./types"

const icons = {
  search: SearchIcon,
  brain: BrainCircuitIcon,
  write: PenLineIcon,
  image: ImageIcon,
  review: ScanEyeIcon,
}

const statusLabels: Record<ExecutionStatus, string> = {
  idle: "Waiting",
  queued: "Queued",
  running: "Executing",
  completed: "Completed",
  error: "Needs attention",
}

export function WorkflowNode({
  node,
  status,
  selected,
  onSelect,
}: {
  node: WorkflowNodeDefinition
  status: ExecutionStatus
  selected: boolean
  onSelect: () => void
}) {
  const Icon = icons[node.icon]

  return (
    <button
      type="button"
      aria-label={node.label}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group absolute z-10 w-52 rounded-xl border bg-card text-left text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary/60 ring-2 ring-primary/15",
        status === "running" && "border-primary shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
      )}
      style={{ left: `${node.position.x}%`, top: `${node.position.y}%` }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground shadow-sm"
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -right-2 size-4 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground shadow-sm",
          (status === "running" || status === "completed") && "bg-primary"
        )}
      />

      <span className="flex items-start gap-3 border-b px-3.5 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {node.provider}
          </span>
          <span className="mt-0.5 block text-sm font-semibold leading-tight">
            {node.label}
          </span>
        </span>
      </span>

      <span className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full bg-muted-foreground/50",
              status === "queued" && "bg-chart-4",
              status === "running" && "animate-pulse bg-primary",
              status === "completed" && "bg-chart-2",
              status === "error" && "bg-destructive"
            )}
          />
          {statusLabels[status]}
        </span>
        {status === "completed" ? (
          <CheckIcon className="size-3.5 text-chart-2" />
        ) : status === "running" ? (
          <LoaderCircleIcon className="size-3.5 animate-spin text-primary" />
        ) : (
          <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-medium">
            {node.id}
          </Badge>
        )}
      </span>
    </button>
  )
}
