export const PIPELINE_STAGES = [
  {
    id: "research",
    label: "Research",
    description: "Sources and angles being developed",
  },
  {
    id: "draft",
    label: "Draft",
    description: "Ideas becoming structured narratives",
  },
  {
    id: "visuals",
    label: "Visuals",
    description: "Carousel storyboards and imagery",
  },
  {
    id: "review",
    label: "Review",
    description: "Editorial and evidence checks",
  },
  {
    id: "ready",
    label: "Ready",
    description: "Approved publishing packages",
  },
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["id"]
export type ContentType = "newsletter" | "carousel"
export type ContentTypeFilter = "all" | ContentType

export interface PipelineItem {
  id: string
  title: string
  type: ContentType
  stage: PipelineStage
  pillar: string
  updatedLabel: string
  sourceCount: number
}
