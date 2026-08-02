import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { CAROUSEL_WORKFLOW } from "./workflow-fixtures"
import { WorkflowNode } from "./workflow-node"

it("identifies the LinkedIn Publisher as a manual node", () => {
  const publisher = CAROUSEL_WORKFLOW.nodes.find((node) => node.id === "publisher")

  if (!publisher) {
    throw new Error("Publisher node fixture is missing")
  }

  render(
    <WorkflowNode
      node={publisher}
      status="idle"
      selected={false}
      onSelect={vi.fn()}
    />
  )

  expect(screen.getByText("LinkedIn Publisher")).toBeInTheDocument()
  expect(screen.getByText("Manual")).toBeInTheDocument()
  expect(screen.getByLabelText("LinkedIn Publisher node")).toHaveAttribute(
    "data-execution-mode",
    "manual"
  )
})
