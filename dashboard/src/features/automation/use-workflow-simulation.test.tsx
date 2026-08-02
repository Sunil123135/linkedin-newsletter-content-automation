import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CAROUSEL_WORKFLOW } from "./workflow-fixtures"
import { RUN_STEP_MS, useWorkflowSimulation } from "./use-workflow-simulation"

afterEach(() => vi.useRealTimers())

describe("useWorkflowSimulation", () => {
  it("runs nodes in order and completes cleanly", async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useWorkflowSimulation(CAROUSEL_WORKFLOW.nodes, CAROUSEL_WORKFLOW.connections)
    )

    act(() => void result.current.run())
    expect(result.current.statuses.source).toBe("running")

    await act(async () => vi.advanceTimersByTimeAsync(RUN_STEP_MS * 5))
    expect(
      Object.values(result.current.statuses).every((status) => status === "completed")
    ).toBe(true)
    expect(result.current.isRunning).toBe(false)
  })
})
