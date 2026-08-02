import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SidebarProvider } from "@/components/ui/sidebar"

import { AutomationDashboard } from "./automation-dashboard"

function renderDashboard(workflow: "carousel" | "newsletter") {
  return render(
    <SidebarProvider>
      <AutomationDashboard workflow={workflow} />
    </SidebarProvider>
  )
}

describe("AutomationDashboard", () => {
  it("renders the LinkedIn workspace without forbidden prototype UI", () => {
    renderDashboard("carousel")
    expect(screen.getByRole("button", { name: "Run Workflow" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Visual Production" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Carousel Output" })).toBeVisible()
    expect(screen.queryByText(/front-end prototype/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pipeline health|command center/i)).not.toBeInTheDocument()
  })

  it("renders the matching Newsletter workspace", () => {
    renderDashboard("newsletter")
    expect(screen.getByRole("heading", { name: "Newsletter Production" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Newsletter Output" })).toBeVisible()
    expect(screen.getByText("The systems behind dependable AI agents")).toBeVisible()
  })
})
