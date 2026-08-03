import { FrameIcon, ImagesIcon, PaletteIcon, SparklesIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

import type { ExecutionStatus } from "./types"

const progressByStatus: Record<ExecutionStatus, number> = {
  idle: 0,
  queued: 15,
  running: 62,
  completed: 100,
  error: 0,
}

const productionItems = [
  { label: "Visual direction", value: "Editorial systems", icon: SparklesIcon },
  { label: "Format", value: "1080 × 1080", icon: FrameIcon },
  { label: "Slide set", value: "5 images", icon: ImagesIcon },
  { label: "Consistency", value: "Type · palette · art direction", icon: PaletteIcon },
]

export function CarouselVisualProduction({ status }: { status: ExecutionStatus }) {
  const progress = progressByStatus[status]

  return (
    <section className="space-y-4" aria-labelledby="visual-production-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Image generation
          </p>
          <h2 id="visual-production-title" className="font-heading text-2xl font-semibold tracking-tight">
            Visual Production
          </h2>
        </div>
        <div className="w-full max-w-64 space-y-1.5">
          <div className="flex justify-between text-[10px] font-medium text-muted-foreground uppercase">
            <span>{status === "running" ? "Rendering set" : status}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} aria-label="Visual production progress" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {productionItems.map((item) => (
          <Card key={item.label} className="gap-0 py-0">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/45">
                <item.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{item.label}</p>
                <p className="truncate text-sm font-medium">{item.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
