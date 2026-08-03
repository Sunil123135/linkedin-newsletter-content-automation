import { describe, expect, it } from "vitest"

import { filterPipelineItems, pipelineItems } from "./pipeline-data"
import { PIPELINE_STAGES } from "./types"

describe("pipeline model", () => {
  it("keeps the five approved stages in lifecycle order", () => {
    expect(PIPELINE_STAGES.map((stage) => stage.id)).toEqual([
      "research",
      "draft",
      "visuals",
      "review",
      "ready",
    ])
  })

  it("filters items without changing the source collection", () => {
    const newsletters = filterPipelineItems(pipelineItems, "newsletter")

    expect(newsletters.length).toBeGreaterThan(0)
    expect(newsletters.every((item) => item.type === "newsletter")).toBe(true)
    expect(pipelineItems.some((item) => item.type === "carousel")).toBe(true)
  })
})
