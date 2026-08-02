import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { CAROUSEL_WORKFLOW } from "./workflow-fixtures"
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
