import type { ContentTypeFilter, PipelineItem } from "./types"

export const pipelineItems: PipelineItem[] = [
  {
    id: "ai-agents",
    title: "Why AI agents need editorial judgment",
    type: "newsletter",
    stage: "research",
    pillar: "AI Leadership",
    updatedLabel: "Updated 18 min ago",
    sourceCount: 7,
  },
  {
    id: "research-loop",
    title: "The evidence-first research loop",
    type: "carousel",
    stage: "research",
    pillar: "Content Systems",
    updatedLabel: "Updated 42 min ago",
    sourceCount: 5,
  },
  {
    id: "human-loop",
    title: "Human-in-the-loop is a product advantage",
    type: "newsletter",
    stage: "draft",
    pillar: "AI Leadership",
    updatedLabel: "Updated 1 hr ago",
    sourceCount: 9,
  },
  {
    id: "content-engine",
    title: "From one insight to a content engine",
    type: "carousel",
    stage: "visuals",
    pillar: "Content Systems",
    updatedLabel: "Updated 2 hrs ago",
    sourceCount: 6,
  },
  {
    id: "source-trust",
    title: "A practical source trust framework",
    type: "newsletter",
    stage: "review",
    pillar: "Responsible AI",
    updatedLabel: "Updated yesterday",
    sourceCount: 12,
  },
  {
    id: "automation-map",
    title: "Map the workflow before automating it",
    type: "carousel",
    stage: "ready",
    pillar: "Automation",
    updatedLabel: "Approved yesterday",
    sourceCount: 4,
  },
]

export function filterPipelineItems(
  items: PipelineItem[],
  type: ContentTypeFilter
): PipelineItem[] {
  return type === "all" ? items : items.filter((item) => item.type === type)
}
