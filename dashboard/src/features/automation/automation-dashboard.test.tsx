import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SidebarProvider } from "@/components/ui/sidebar"

import { AutomationDashboard } from "./automation-dashboard"

function renderDashboard(workflow: "carousel" | "newsletter") {
  return render(
    <SidebarProvider>
      <AutomationDashboard workflow={workflow} />
    </SidebarProvider>
  )
}

function stubLinkedInConnection(connection: {
  connected: boolean
  reconnectRequired: boolean
  displayName?: string
} = {
  connected: true,
  reconnectRequired: false,
  displayName: "Ada Lovelace",
}) {
  const fetch = vi.fn().mockResolvedValue(
    Response.json(connection)
  )
  vi.stubGlobal("fetch", fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("AutomationDashboard", () => {
  it("renders the LinkedIn workspace without forbidden prototype UI", () => {
    renderDashboard("carousel")
    expect(screen.getByRole("button", { name: "Run Workflow" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Visual Production" })).toBeVisible()
    expect(screen.getByText("5 images")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Carousel Output" })).toBeVisible()
    expect(screen.queryByText(/front-end prototype/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pipeline health|command center/i)).not.toBeInTheDocument()
  })

  it("renders LinkedIn Publisher only in the carousel workflow", () => {
    const carousel = renderDashboard("carousel")
    expect(screen.getByRole("button", { name: "LinkedIn Publisher node" })).toBeVisible()

    carousel.unmount()
    renderDashboard("newsletter")
    expect(screen.queryByRole("button", { name: "LinkedIn Publisher node" })).not.toBeInTheDocument()
  })

  it("keeps the Publisher idle after Run Workflow completes", async () => {
    vi.useFakeTimers()
    renderDashboard("carousel")

    fireEvent.click(screen.getByRole("button", { name: "Run Workflow" }))
    await act(async () => vi.runAllTimersAsync())

    expect(screen.getByRole("button", { name: "LinkedIn Publisher node" })).toHaveTextContent("Waiting")
  })

  it("never calls /api/linkedin/publish from Run Workflow", async () => {
    vi.useFakeTimers()
    const fetch = stubLinkedInConnection()
    renderDashboard("carousel")

    fireEvent.click(screen.getByRole("button", { name: "LinkedIn Publisher node" }))
    expect(screen.getByRole("region", { name: "LinkedIn Publisher details" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Run Workflow" }))
    await act(async () => vi.runAllTimersAsync())

    expect(fetch.mock.calls.some(([input]) => String(input).includes("/api/linkedin/publish"))).toBe(false)
  })

  it("opens the publisher panel when the Publisher node is selected", async () => {
    const user = userEvent.setup()
    stubLinkedInConnection()
    renderDashboard("carousel")

    await user.click(screen.getByRole("button", { name: "LinkedIn Publisher node" }))

    expect(await screen.findByText("LinkedIn document post")).toBeVisible()
    expect(screen.getByText("No approved revision")).toBeVisible()
  })

  it("keeps Publish locked for CSS-only fixture slides", async () => {
    const user = userEvent.setup()
    stubLinkedInConnection()
    renderDashboard("carousel")

    await user.click(screen.getByRole("button", { name: "LinkedIn Publisher node" }))

    expect(await screen.findByText("Publishing is locked until an approved carousel artifact is available.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("keeps the Publisher summary and panel aligned after a connected preflight", async () => {
    const user = userEvent.setup()
    stubLinkedInConnection()
    renderDashboard("carousel")

    await user.click(screen.getByRole("button", { name: "LinkedIn Publisher node" }))

    await waitFor(() =>
      expect(screen.getAllByText("Connected as Ada Lovelace")).toHaveLength(2)
    )
  })

  it("keeps the Publisher summary and panel connected without a display name", async () => {
    const user = userEvent.setup()
    stubLinkedInConnection({ connected: true, reconnectRequired: false })
    renderDashboard("carousel")

    await user.click(screen.getByRole("button", { name: "LinkedIn Publisher node" }))

    await waitFor(() =>
      expect(screen.getAllByText("Connected as LinkedIn member")).toHaveLength(2)
    )
  })

  it("keeps disconnected fixture Publisher controls locked", async () => {
    const user = userEvent.setup()
    stubLinkedInConnection({ connected: false, reconnectRequired: false })
    renderDashboard("carousel")

    await user.click(screen.getByRole("button", { name: "LinkedIn Publisher node" }))

    expect(await screen.findByText("LinkedIn not connected")).toBeVisible()
    expect(screen.getByText("Publishing is locked until an approved carousel artifact is available.")).toBeVisible()
    expect(screen.queryByRole("button", { name: /Connect LinkedIn|Reconnect LinkedIn|Publish to LinkedIn/ })).not.toBeInTheDocument()
  })

  it("associates the selected Publisher node with its details region only", async () => {
    const user = userEvent.setup()
    stubLinkedInConnection()
    renderDashboard("carousel")

    const publisherNode = screen.getByRole("button", { name: "LinkedIn Publisher node" })
    expect(publisherNode).not.toHaveAttribute("aria-controls")
    await user.click(publisherNode)

    const details = await screen.findByRole("region", { name: "LinkedIn Publisher details" })
    expect(publisherNode).toHaveAttribute("aria-controls", details.id)
    await user.click(screen.getByRole("button", { name: "Find Current News node" }))
    expect(screen.getByRole("button", { name: "Find Current News node" })).not.toHaveAttribute("aria-controls")
  })

  it("renders the matching Newsletter workspace", () => {
    renderDashboard("newsletter")
    expect(screen.getByRole("heading", { name: "Newsletter Production" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Newsletter Output" })).toBeVisible()
    expect(screen.getByText("The systems behind dependable AI agents")).toBeVisible()
  })

  it("renders Newsletter without a Publisher node or LinkedIn panel", () => {
    renderDashboard("newsletter")

    expect(screen.queryByRole("button", { name: "LinkedIn Publisher node" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "LinkedIn document post" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "LinkedIn Publisher details" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collect Sources node" })).not.toHaveAttribute("aria-controls")
  })
})
