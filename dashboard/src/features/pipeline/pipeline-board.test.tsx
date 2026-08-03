import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PipelineBoard } from "./pipeline-board"
import { pipelineItems } from "./pipeline-data"
import { PipelineWorkspace } from "./pipeline-workspace"

describe("PipelineBoard", () => {
  it("renders every lifecycle stage and its matching items", () => {
    render(<PipelineBoard items={pipelineItems} />)

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5)
    expect(
      screen.getByText("Why AI agents need editorial judgment")
    ).toBeVisible()
    expect(
      screen.getByText("Map the workflow before automating it")
    ).toBeVisible()
  })

  it("shows a useful empty state inside an empty stage", () => {
    render(
      <PipelineBoard
        items={pipelineItems.filter((item) => item.stage !== "review")}
      />
    )

    const reviewColumn = screen.getByTestId("pipeline-column-review")
    expect(within(reviewColumn).getByText("No items in review")).toBeVisible()
  })
})

describe("PipelineWorkspace", () => {
  it("filters the board by output type", () => {
    render(<PipelineWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: "Newsletters" }))

    expect(
      screen.getByText("Why AI agents need editorial judgment")
    ).toBeVisible()
    expect(
      screen.queryByText("The evidence-first research loop")
    ).not.toBeInTheDocument()
  })
})
