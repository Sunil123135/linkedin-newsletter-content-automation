import { describe, expect, it } from "vitest"

import {
  CAROUSEL_SLIDES,
  CAROUSEL_WORKFLOW,
} from "./workflow-fixtures"

describe("automation fixtures", () => {
  it("connects every carousel node in workflow order", () => {
    expect(CAROUSEL_WORKFLOW.connections).toHaveLength(CAROUSEL_WORKFLOW.nodes.length - 1)
    expect(CAROUSEL_WORKFLOW.connections[0].from).toBe(CAROUSEL_WORKFLOW.nodes[0].id)
    expect(CAROUSEL_WORKFLOW.connections.at(-1)?.to).toBe(CAROUSEL_WORKFLOW.nodes.at(-1)?.id)
  })

  it("models a five-step automatic carousel plus a manual publisher", () => {
    expect(CAROUSEL_SLIDES).toHaveLength(5)
    expect(CAROUSEL_WORKFLOW.nodes.map((node) => node.id)).toEqual([
      "source",
      "research",
      "writer",
      "visual",
      "review",
      "publisher",
    ])
    expect(CAROUSEL_WORKFLOW.nodes.at(-1)?.executionMode).toBe("manual")
    expect(CAROUSEL_WORKFLOW.connections.at(-1)).toMatchObject({
      from: "review",
      to: "publisher",
    })
  })

  it("contains five individually identifiable carousel slides", () => {
    expect(new Set(CAROUSEL_SLIDES.map((slide) => slide.id)).size).toBe(5)
  })
})
