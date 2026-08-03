import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

import type { PipelineItem } from "./types"

export function ContentCard({ item }: { item: PipelineItem }) {
  return (
    <Card className="gap-3 border-border bg-card py-4 shadow-sm">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="capitalize">
            {item.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {item.sourceCount} sources
          </span>
        </div>
        <h3 className="text-sm font-semibold leading-snug text-card-foreground">
          {item.title}
        </h3>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3 px-4">
        <span className="text-xs font-medium text-muted-foreground">
          {item.pillar}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {item.updatedLabel}
        </span>
      </CardContent>
    </Card>
  )
}
