import { ContentCard } from "./content-card"
import { PIPELINE_STAGES, type PipelineItem } from "./types"

export function PipelineColumn({
  stage,
  items,
}: {
  stage: (typeof PIPELINE_STAGES)[number]
  items: PipelineItem[]
}) {
  return (
    <section
      data-testid={`pipeline-column-${stage.id}`}
      aria-labelledby={`pipeline-heading-${stage.id}`}
      className="w-[min(82vw,20rem)] rounded-xl border border-border bg-muted/30 p-3 sm:w-72 xl:w-80"
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <h2
            id={`pipeline-heading-${stage.id}`}
            className="text-sm font-semibold"
          >
            {stage.label}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {stage.description}
          </p>
        </div>
        <span
          aria-label={`${items.length} items`}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground"
        >
          {items.length}
        </span>
      </div>
      <div className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => <ContentCard key={item.id} item={item} />)
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No items in {stage.label.toLowerCase()}
          </div>
        )}
      </div>
    </section>
  )
}
