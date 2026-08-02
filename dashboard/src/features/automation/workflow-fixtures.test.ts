import { describe, expect, it } from "vitest"

import {
  CAROUSEL_SLIDES,
  CAROUSEL_WORKFLOW,
  NEWSLETTER_ARTICLE,
  NEWSLETTER_WORKFLOW,
} from "./workflow-fixtures"

describe("automation fixtures", () => {
  it.each([CAROUSEL_WORKFLOW, NEWSLETTER_WORKFLOW])(
    "$kind connects every node in workflow order",
    (workflow) => {
      expect(workflow.connections).toHaveLength(workflow.nodes.length - 1)
      expect(workflow.connections[0].from).toBe(workflow.nodes[0].id)
      expect(workflow.connections.at(-1)?.to).toBe(workflow.nodes.at(-1)?.id)
    }
  )

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
    expect(NEWSLETTER_WORKFLOW.nodes).toHaveLength(5)
    expect(NEWSLETTER_WORKFLOW.nodes.some((node) => node.id === "publisher")).toBe(false)
  })

  it("contains five individually identifiable carousel slides", () => {
    expect(new Set(CAROUSEL_SLIDES.map((slide) => slide.id)).size).toBe(5)
  })

  it("contains publication-shaped newsletter content", () => {
    expect(NEWSLETTER_ARTICLE.sections.length).toBeGreaterThanOrEqual(3)
    expect(NEWSLETTER_ARTICLE.citationCount).toBeGreaterThan(0)
  })
})
