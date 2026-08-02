"use client"

import { useState } from "react"
import { Maximize2Icon, MinusIcon, PlusIcon, WorkflowIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import type { ExecutionStatus, NodeId, WorkflowDefinition } from "./types"
import { WorkflowConnections } from "./workflow-connections"
import { WorkflowNode } from "./workflow-node"

export function WorkflowCanvas({
  workflow,
  statuses,
  activeConnectionId,
  selectedNodeId,
  onSelectNode,
}: {
  workflow: WorkflowDefinition
  statuses: Record<NodeId, ExecutionStatus>
  activeConnectionId: string | null
  selectedNodeId: NodeId
  onSelectNode: (id: NodeId) => void
}) {
  const [zoom, setZoom] = useState(1)

  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg border bg-muted/50">
            <WorkflowIcon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Workflow canvas</p>
            <p className="text-xs text-muted-foreground">
              {workflow.nodes.length} nodes · {workflow.connections.length} connections
            </p>
          </div>
          <Badge variant="outline" className="ml-1 hidden text-[10px] sm:inline-flex">
            UI simulation
          </Badge>
        </div>
        <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.8, value - 0.1))}
          >
            <MinusIcon />
          </Button>
          <span className="w-12 text-center font-mono text-[11px] text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))}
          >
            <PlusIcon />
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Reset zoom"
            onClick={() => setZoom(1)}
          >
            <Maximize2Icon />
          </Button>
        </div>
      </div>

      <div
        className="relative min-h-[34rem] overflow-auto bg-muted/10"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--border) 72%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div
          className="relative h-[500px] min-w-[1000px] transition-transform duration-200 ease-out"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          <WorkflowConnections
            connections={workflow.connections}
            activeConnectionId={activeConnectionId}
          />
          {workflow.nodes.map((node) => (
            <WorkflowNode
              key={node.id}
              node={node}
              status={statuses[node.id]}
              selected={selectedNodeId === node.id}
              onSelect={() => onSelectNode(node.id)}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border bg-background/85 px-2 py-1 font-mono text-[9px] tracking-wider text-muted-foreground uppercase backdrop-blur">
          Fixed layout · Select a node to inspect
        </div>
      </div>
    </Card>
  )
}
