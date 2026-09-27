import { describe, expect, it } from "vitest"

import { CAROUSEL_WORKFLOW } from "@/features/automation/workflow-fixtures"

import { NEWSLETTER_WORKFLOW } from "./newsletter-fixtures"

describe("newsletter workflow", () => {
  it("adds Resend only after newsletter review without changing the carousel graph", () => {
    expect(NEWSLETTER_WORKFLOW.nodes.map((node) => node.id)).toEqual([
      "source",
      "research",
      "writer",
      "visual",
      "review",
      "publish",
    ])
    expect(NEWSLETTER_WORKFLOW.connections.at(-1)).toMatchObject({
      from: "review",
      to: "publish",
    })
    expect(NEWSLETTER_WORKFLOW.nodes.at(-1)).toMatchObject({
      provider: "Resend",
      icon: "publish",
    })

    expect(CAROUSEL_WORKFLOW.nodes.at(-1)?.id).toBe("publisher")
    expect(CAROUSEL_WORKFLOW.nodes.some((node) => node.id === "publish")).toBe(false)
  })
})
