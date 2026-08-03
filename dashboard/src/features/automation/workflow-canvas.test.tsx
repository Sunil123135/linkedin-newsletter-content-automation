import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { CAROUSEL_WORKFLOW, NEWSLETTER_WORKFLOW } from "./workflow-fixtures"
import { WorkflowCanvas } from "./workflow-canvas"
import type { ExecutionStatus, NodeId } from "./types"

const idleStatuses = Object.fromEntries(
  CAROUSEL_WORKFLOW.nodes.map((node) => [node.id, "idle"])
) as Record<NodeId, ExecutionStatus>

it("selects nodes and exposes zoom controls", async () => {
  const user = userEvent.setup()
  const onSelectNode = vi.fn()
  render(
    <WorkflowCanvas
      workflow={CAROUSEL_WORKFLOW}
      statuses={idleStatuses}
      activeConnectionId={null}
      selectedNodeId="source"
      onSelectNode={onSelectNode}
    />
  )

  await user.click(screen.getByRole("button", { name: /write carousel copy/i }))
  expect(onSelectNode).toHaveBeenCalledWith("writer")
  await user.click(screen.getByRole("button", { name: /zoom in/i }))
  expect(screen.getByText("110%")).toBeVisible()
  await user.click(screen.getByRole("button", { name: /reset zoom/i }))
  expect(screen.getByText("100%")).toBeVisible()
})

it.each([
  [CAROUSEL_WORKFLOW, "6 nodes · 5 connections"],
  [NEWSLETTER_WORKFLOW, "5 nodes · 4 connections"],
])("shows the workflow's node and connection count", (workflow, summary) => {
  render(
    <WorkflowCanvas
      workflow={workflow}
      statuses={idleStatuses}
      activeConnectionId={null}
      selectedNodeId="source"
      onSelectNode={vi.fn()}
    />
  )

  expect(screen.getByText(summary)).toBeVisible()
})

it("forwards an optional details relationship only to the selected node", () => {
  render(
    <WorkflowCanvas
      workflow={CAROUSEL_WORKFLOW}
      statuses={idleStatuses}
      activeConnectionId={null}
      selectedNodeId="publisher"
      selectedNodeDetailsId="publisher-details"
      onSelectNode={vi.fn()}
    />
  )

  expect(screen.getByRole("button", { name: "LinkedIn Publisher node" })).toHaveAttribute(
    "aria-controls",
    "publisher-details"
  )
  expect(screen.getByRole("button", { name: "Find Current News node" })).not.toHaveAttribute("aria-controls")
})
