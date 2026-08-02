import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CAROUSEL_WORKFLOW } from "./workflow-fixtures"
import { RUN_STEP_MS, useWorkflowSimulation } from "./use-workflow-simulation"

afterEach(() => vi.useRealTimers())

describe("useWorkflowSimulation", () => {
  it("runs automatic nodes but leaves the manual publisher idle", async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useWorkflowSimulation(CAROUSEL_WORKFLOW.nodes, CAROUSEL_WORKFLOW.connections)
    )

    act(() => void result.current.run())
    await act(async () => vi.runAllTimersAsync())

    expect(result.current.statuses.publisher).toBe("idle")
    expect(result.current.statuses.review).toBe("completed")
    expect(result.current.activeConnectionId).toBeNull()
    expect(result.current.isRunning).toBe(false)
  })

  it("does not animate the connection to the manual publisher", async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useWorkflowSimulation(CAROUSEL_WORKFLOW.nodes, CAROUSEL_WORKFLOW.connections)
    )
    const observedConnectionIds: Array<string | null> = []

    act(() => void result.current.run())
    for (let index = 0; index < 5; index += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(RUN_STEP_MS))
      observedConnectionIds.push(result.current.activeConnectionId)
    }

    expect(observedConnectionIds).toEqual([
      "source-research",
      "research-writer",
      "writer-visual",
      "visual-review",
      null,
    ])
    expect(result.current.statuses.review).toBe("completed")
    expect(result.current.isRunning).toBe(false)
  })

  it("does not make external requests when completing the automatic carousel workflow", async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const { result } = renderHook(() =>
      useWorkflowSimulation(CAROUSEL_WORKFLOW.nodes, CAROUSEL_WORKFLOW.connections)
    )

    try {
      act(() => void result.current.run())
      await act(async () => vi.runAllTimersAsync())

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(result.current.isRunning).toBe(false)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
