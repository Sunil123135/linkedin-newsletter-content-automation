import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PublisherFetch } from "./linkedin-publisher-client"
import { LinkedInPublisherPanel } from "./linkedin-publisher-panel"

const panelProps = {
  runId: "run-123",
  revision: 3,
  artifactReady: true,
  onStateChange: vi.fn(),
}
const browserLocation = window.location

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(window, "location", {
    configurable: true,
    value: browserLocation,
  })
})

describe("LinkedInPublisherPanel", () => {
  it("shows Connect LinkedIn while disconnected", async () => {
    stubFetch(connectionResponse({ connected: false, reconnectRequired: false }))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByRole("button", { name: "Connect LinkedIn" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("shows Reconnect LinkedIn when the credential expired", async () => {
    stubFetch(connectionResponse({ connected: false, reconnectRequired: true }))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByRole("button", { name: "Reconnect LinkedIn" })).toBeEnabled()
  })

  it("shows a locked reason when no approved real artifact exists", async () => {
    stubFetch(connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} artifactReady={false} />)

    expect(await screen.findByText("Publishing is locked until an approved carousel artifact is available.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("enables Publish only when connected and artifactReady is true", async () => {
    stubFetch(connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByRole("button", { name: "Publish to LinkedIn" })).toBeEnabled()
    expect(screen.getByText("Connected as Ada Lovelace")).toBeVisible()
  })

  it("does not call publish before the confirmation button is clicked", async () => {
    const fetch = stubFetch(connectionResponse(connectedConnection))
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)

    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))

    expect(screen.getByRole("dialog")).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("disables all actions while publishing", async () => {
    const publish = deferredResponse()
    stubFetch(
      connectionResponse(connectedConnection),
      publish.promise,
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(screen.getByRole("button", { name: "Publishing document" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    publish.resolve(Response.json({
      postUrn: "urn:li:share:post-789",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
      publishedAt: "2026-08-03T10:00:01.000Z",
    }))
    await screen.findByRole("link", { name: "View LinkedIn post" })
  })

  it("shows the LinkedIn post link after success", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      Response.json({
        postUrn: "urn:li:share:post-789",
        postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
        publishedAt: "2026-08-03T10:00:01.000Z",
      }),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByRole("link", { name: "View LinkedIn post" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/feed/update/urn:li:share:post-789",
    )
    await waitFor(() => expect(panelProps.onStateChange).toHaveBeenLastCalledWith("published"))
  })

  it("reuses the final-confirmation idempotency key for one safe transport retry", async () => {
    const fetch = stubFetch(
      connectionResponse(connectedConnection),
      new TypeError("Network connection interrupted"),
      Response.json({
        postUrn: "urn:li:share:post-789",
        postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
        publishedAt: "2026-08-03T10:00:01.000Z",
      }),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    await screen.findByRole("link", { name: "View LinkedIn post" })
    const firstPublishBody = JSON.parse(fetch.mock.calls[1][1]?.body as string)
    const retriedPublishBody = JSON.parse(fetch.mock.calls[2][1]?.body as string)
    expect(retriedPublishBody).toEqual(firstPublishBody)
    expect(firstPublishBody).toMatchObject({ runId: "run-123", revision: 3 })
  })

  it("requires manual recovery for UNKNOWN_OUTCOME", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      Response.json({
        error: { code: "UNKNOWN_OUTCOME", message: "The post may have been created." },
      }, { status: 409 }),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByText("We could not confirm whether LinkedIn created the post. Check LinkedIn before trying again."))
      .toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("returns to reconnect when LinkedIn rejects the credential", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      Response.json({
        error: { code: "AUTH_REQUIRED", message: "Connect LinkedIn before publishing." },
      }, { status: 401 }),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByRole("button", { name: "Reconnect LinkedIn" })).toBeEnabled()
  })

  it("redirects through OAuth when connecting or reconnecting", async () => {
    const assign = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    })
    stubFetch(connectionResponse({ connected: false, reconnectRequired: true }))
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Reconnect LinkedIn" }))

    expect(assign).toHaveBeenCalledWith("/api/linkedin/oauth/start")
  })
})

const connectedConnection = {
  connected: true,
  displayName: "Ada Lovelace",
  expiresAt: 1_900_000_000_000,
  reconnectRequired: false,
}

function connectionResponse(connection: object): Response {
  return Response.json(connection)
}

function stubFetch(...responses: Array<Response | Promise<Response> | Error>) {
  const fetch = vi.fn<PublisherFetch>(async () => {
    const response = responses.shift()
    if (!response) throw new Error("Unexpected fetch")
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function deferredResponse() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
