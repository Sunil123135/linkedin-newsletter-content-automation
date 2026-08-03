import { Button } from "@/components/ui/button"

import type { ContentTypeFilter } from "./types"

const options: { value: ContentTypeFilter; label: string }[] = [
  { value: "all", label: "All content" },
  { value: "newsletter", label: "Newsletters" },
  { value: "carousel", label: "Carousels" },
]

export function PipelineFilters({
  value,
  onChange,
}: {
  value: ContentTypeFilter
  onChange: (value: ContentTypeFilter) => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Filter pipeline by output type"
    >
      {options.map((option) => {
        const selected = value === option.value

        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
