import { ArrowRightIcon, CircleDotIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { WorkflowNodeDefinition } from "./types"

export function NodeInspector({ node }: { node: WorkflowNodeDefinition }) {
  return (
    <Card className="h-full min-h-[16rem] overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Selected node
        </p>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{node.label}</CardTitle>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {node.provider}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{node.description}</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Input</p>
          <p className="text-sm">{node.input}</p>
        </div>
        <div className="flex items-center text-muted-foreground">
          <ArrowRightIcon className="size-4" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Output</p>
          <p className="text-sm">{node.output}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            <CircleDotIcon className="size-3" /> Latest result
          </p>
          <p className="text-sm font-medium">{node.result}</p>
        </div>
      </CardContent>
    </Card>
  )
}
