import { PipelineColumn } from "./pipeline-column"
import { PIPELINE_STAGES, type PipelineItem } from "./types"

export function PipelineBoard({ items }: { items: PipelineItem[] }) {
  return (
    <section
      aria-label="Content production pipeline"
      className="overflow-x-auto pb-4"
    >
      <div className="grid min-w-max grid-cols-5 gap-4 px-4 lg:px-6">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            items={items.filter((item) => item.stage === stage.id)}
          />
        ))}
      </div>
    </section>
  )
}
