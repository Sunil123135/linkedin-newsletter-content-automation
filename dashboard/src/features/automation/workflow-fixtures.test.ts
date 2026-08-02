import { describe, expect, it } from "vitest"

import {
  CAROUSEL_SLIDES,
  CAROUSEL_WORKFLOW,
  NEWSLETTER_ARTICLE,
  NEWSLETTER_WORKFLOW,
} from "./workflow-fixtures"

describe("automation fixtures", () => {
  it.each([CAROUSEL_WORKFLOW, NEWSLETTER_WORKFLOW])(
    "$kind has five connected nodes",
    (workflow) => {
      expect(workflow.nodes).toHaveLength(5)
      expect(workflow.connections).toHaveLength(4)
      expect(workflow.connections[0].from).toBe(workflow.nodes[0].id)
      expect(workflow.connections.at(-1)?.to).toBe(workflow.nodes.at(-1)?.id)
    }
  )

  it("contains eight individually identifiable carousel slides", () => {
    expect(CAROUSEL_SLIDES).toHaveLength(8)
    expect(new Set(CAROUSEL_SLIDES.map((slide) => slide.id)).size).toBe(8)
  })

  it("contains publication-shaped newsletter content", () => {
    expect(NEWSLETTER_ARTICLE.sections.length).toBeGreaterThanOrEqual(3)
    expect(NEWSLETTER_ARTICLE.citationCount).toBeGreaterThan(0)
  })
})
