import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  vi.clearAllMocks()
  vi.useRealTimers()
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

  it("reports a safe connected presentation after preflight", async () => {
    const onConnectionPresentationChange = vi.fn()
    stubFetch(connectionResponse(connectedConnection))

    render(
      <LinkedInPublisherPanel
        {...panelProps}
        onConnectionPresentationChange={onConnectionPresentationChange}
      />
    )

    await waitFor(() => expect(onConnectionPresentationChange).toHaveBeenLastCalledWith({
      connected: true,
      displayName: "Ada Lovelace",
    }))
  })

  it("keeps fixture publishing locked before offering a connection action", async () => {
    stubFetch(connectionResponse({ connected: false, reconnectRequired: false }))

    render(<LinkedInPublisherPanel {...panelProps} artifactReady={false} />)

    expect(await screen.findByText("Publishing is locked until an approved carousel artifact is available.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Connect LinkedIn" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("keeps a disconnected Publisher locked when the approved run identity is missing", async () => {
    stubFetch(connectionResponse({ connected: false, reconnectRequired: false }))

    render(<LinkedInPublisherPanel {...panelProps} runId={null} />)

    expect(await screen.findByText("Publishing is locked until an approved run and revision are available.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Connect LinkedIn" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("locks an artifact without a run identity", async () => {
    stubFetch(connectionResponse(connectedConnection))
    const onStateChange = vi.fn()

    render(<LinkedInPublisherPanel {...panelProps} runId={null} onStateChange={onStateChange} />)

    expect(await screen.findByText("Publishing is locked until an approved run and revision are available.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith("locked"))
  })

  it("locks an artifact without a revision identity", async () => {
    stubFetch(connectionResponse(connectedConnection))
    const onStateChange = vi.fn()

    render(<LinkedInPublisherPanel {...panelProps} revision={null} onStateChange={onStateChange} />)

    expect(await screen.findByText("Publishing is locked until an approved run and revision are available.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith("locked"))
  })

  it("enables Publish only when connected and artifactReady is true", async () => {
    stubFetch(connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByRole("button", { name: "Publish to LinkedIn" })).toBeEnabled()
    expect(screen.getByText("Connected as Ada Lovelace")).toBeVisible()
  })

  it("keeps a reconciled in-progress attempt locked after a browser reload", async () => {
    stubFetchForStatus({ state: "in_progress" }, connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByText(
      "A publish attempt is still being reconciled. Refresh after it completes.",
    )).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("fails closed when a reconciled attempt has an unknown post outcome", async () => {
    stubFetchForStatus({ state: "unknown" }, connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByText(
      "We could not confirm whether LinkedIn created the post. Check LinkedIn before trying again.",
    )).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("restores an existing published post instead of offering another publish", async () => {
    stubFetchForStatus({
      state: "published",
      postUrl: publishResult.postUrl,
      publishedAt: publishResult.publishedAt,
    }, connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByRole("link", { name: "View LinkedIn post" })).toHaveAttribute(
      "href",
      publishResult.postUrl,
    )
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("allows confirmation after the server proves a stale pre-Posts attempt retry-safe", async () => {
    stubFetchForStatus({ state: "retry_safe" }, connectionResponse(connectedConnection))

    render(<LinkedInPublisherPanel {...panelProps} />)

    expect(await screen.findByRole("button", { name: "Publish to LinkedIn" })).toBeEnabled()
  })

  it("uses only server-validated title, caption, and five previews in final confirmation", async () => {
    stubFetch(connectionResponse(connectedConnection))
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))

    expect(screen.getByText(preflight.documentTitle)).toBeVisible()
    expect(screen.getByText(preflight.caption)).toBeVisible()
    expect(screen.getAllByRole("img", { name: /Server slide/ })).toHaveLength(5)
  })

  it("keeps a changed revision locked when its server preflight is stale", async () => {
    const fetch = vi.fn<PublisherFetch>(async (input) => {
      const url = String(input)
      if (url === "/api/linkedin/connection") return connectionResponse(connectedConnection)
      if (url.startsWith("/api/linkedin/publish/status?")) {
        return Response.json({ state: "idle" })
      }
      if (url.includes("revision=4")) {
        return errorResponse("STALE_REVISION", 409, "The approved carousel revision has changed.")
      }
      return Response.json(preflight)
    })
    vi.stubGlobal("fetch", fetch)
    const view = render(<LinkedInPublisherPanel {...panelProps} />)
    await screen.findByRole("button", { name: "Publish to LinkedIn" })

    view.rerender(<LinkedInPublisherPanel {...panelProps} revision={4} />)

    expect(await screen.findByText("This carousel revision is stale. Rerun and approve the current revision before publishing.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("does not call publish before the confirmation button is clicked", async () => {
    const fetch = stubFetch(connectionResponse(connectedConnection))
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)

    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))

    expect(screen.getByRole("dialog")).toBeVisible()
    expect(fetch.mock.calls.some(([input]) => String(input) === "/api/linkedin/publish")).toBe(false)
  })

  it("disables all actions while publishing", async () => {
    const publish = deferredResponse()
    stubFetch(
      connectionResponse(connectedConnection),
      publish.promise,
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await act(async () => {
      await Promise.resolve()
    })
    await user.click(screen.getByRole("button", { name: "Publish to LinkedIn" }))
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
    await act(async () => {
      await Promise.resolve()
    })
    await user.click(screen.getByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByRole("link", { name: "View LinkedIn post" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/feed/update/urn:li:share:post-789",
    )
    const successStatus = screen.getByRole("status", { name: "LinkedIn publish status" })
    expect(successStatus).toHaveTextContent("Published successfully")
    expect(successStatus).toHaveFocus()
    await waitFor(() => expect(panelProps.onStateChange).toHaveBeenLastCalledWith("published"))
  })

  it("keeps a result for its execution identity and clears it for a new run", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      Response.json(publishResult),
    )
    const user = userEvent.setup()
    const view = render(<LinkedInPublisherPanel {...panelProps} />)

    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))
    await screen.findByRole("link", { name: "View LinkedIn post" })

    view.rerender(<LinkedInPublisherPanel {...panelProps} />)
    expect(screen.getByRole("link", { name: "View LinkedIn post" })).toBeVisible()

    view.rerender(<LinkedInPublisherPanel {...panelProps} runId="run-456" revision={4} />)
    await screen.findByRole("button", { name: "Publish to LinkedIn" })
    expect(screen.queryByRole("link", { name: "View LinkedIn post" })).not.toBeInTheDocument()
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
    const publishCalls = fetch.mock.calls.filter(([input]) => String(input) === "/api/linkedin/publish")
    const firstPublishBody = JSON.parse(publishCalls[0][1]?.body as string)
    const retriedPublishBody = JSON.parse(publishCalls[1][1]?.body as string)
    expect(retriedPublishBody).toEqual(firstPublishBody)
    expect(firstPublishBody).toMatchObject({ runId: "run-123", revision: 3 })
    expect(firstPublishBody.artifactChecksum).toBe(preflight.artifactChecksum)
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

  it("clears UNKNOWN_OUTCOME recovery when the execution identity changes", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      errorResponse("UNKNOWN_OUTCOME", 409, "The post may have been created."),
    )
    const user = userEvent.setup()
    const view = render(<LinkedInPublisherPanel {...panelProps} />)

    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))
    await screen.findByText("We could not confirm whether LinkedIn created the post. Check LinkedIn before trying again.")

    view.rerender(<LinkedInPublisherPanel {...panelProps} runId="run-456" revision={4} />)

    expect(await screen.findByRole("button", { name: "Publish to LinkedIn" })).toBeEnabled()
    expect(screen.queryByText("We could not confirm whether LinkedIn created the post. Check LinkedIn before trying again."))
      .not.toBeInTheDocument()
  })

  it("does not apply a completed old request to a new execution identity", async () => {
    const publish = deferredResponse()
    stubFetch(connectionResponse(connectedConnection), publish.promise)
    const user = userEvent.setup()
    const view = render(<LinkedInPublisherPanel {...panelProps} />)

    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))
    view.rerender(<LinkedInPublisherPanel {...panelProps} runId="run-456" revision={4} />)
    await screen.findByRole("button", { name: "Publish to LinkedIn" })

    publish.resolve(Response.json(publishResult))

    await waitFor(() => expect(screen.queryByRole("link", { name: "View LinkedIn post" })).not.toBeInTheDocument())
    expect(screen.getByRole("button", { name: "Publish to LinkedIn" })).toBeEnabled()
  })

  it.each([
    ["STALE_REVISION", "This carousel revision is stale. Rerun and approve the current revision before publishing."],
    ["INVALID_ARTIFACT", "This carousel artifact is no longer publishable. Rerun and approve a real artifact before publishing."],
  ] as const)("locks publishing for %s", async (code, message) => {
    stubFetch(connectionResponse(connectedConnection), errorResponse(code, code === "STALE_REVISION" ? 409 : 422, message))
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByText(message)).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("blocks duplicate publishing and directs the user to check the existing attempt", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      errorResponse("DUPLICATE_PUBLISH", 409, "A post attempt already exists. Refresh or check LinkedIn before publishing again."),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByText("A post attempt already exists. Refresh or check LinkedIn before publishing again.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish to LinkedIn" })).not.toBeInTheDocument()
  })

  it("holds a rate-limited publish until the server-provided delay expires", async () => {
    vi.useFakeTimers()
    stubFetch(
      connectionResponse(connectedConnection),
      errorResponse("RATE_LIMITED", 429, "Try again later.", 60),
    )
    render(<LinkedInPublisherPanel {...panelProps} />)
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole("button", { name: "Publish to LinkedIn" }))
    fireEvent.click(screen.getByRole("button", { name: "Publish document" }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText("LinkedIn asked you to retry in 60 seconds.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Retry Publish in 60s" })).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByRole("button", { name: "Retry Publish" })).toBeEnabled()
  })

  it.each([
    [undefined, "LinkedIn asked you to retry later."],
    [0, "LinkedIn asked you to retry now."],
  ] as const)("offers a manual confirmation-gated retry when RATE_LIMITED returns %s seconds", async (retryAfterSeconds, guidance) => {
    stubFetch(
      connectionResponse(connectedConnection),
      errorResponse("RATE_LIMITED", 429, "Try again later.", retryAfterSeconds),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByText(guidance)).toBeVisible()
    expect(screen.getByRole("button", { name: "Retry Publish" })).toBeEnabled()
    expect(document.body.textContent).not.toMatch(/undefined|NaN|-\d+s/i)
    await user.click(screen.getByRole("button", { name: "Retry Publish" }))
    expect(screen.getByRole("dialog", { name: "Publish carousel to LinkedIn" })).toBeVisible()
  })

  it("routes retry-safe provider failures back through the confirmation dialog", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      errorResponse("LINKEDIN_UNAVAILABLE", 503, "LinkedIn is temporarily unavailable."),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))
    await user.click(await screen.findByRole("button", { name: "Retry Publish" }))

    expect(screen.getByRole("dialog", { name: "Publish carousel to LinkedIn" })).toBeVisible()
  })

  it("blocks publishing for an operator configuration error", async () => {
    stubFetch(
      connectionResponse(connectedConnection),
      errorResponse("CONFIGURATION_ERROR", 503, "LinkedIn publishing is not configured. Contact an operator to configure it."),
    )
    const user = userEvent.setup()

    render(<LinkedInPublisherPanel {...panelProps} />)
    await user.click(await screen.findByRole("button", { name: "Publish to LinkedIn" }))
    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(await screen.findByText("LinkedIn publishing is not configured. Contact an operator to configure it.")).toBeVisible()
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

const publishResult = {
  postUrn: "urn:li:share:post-789",
  postUrl: "https://www.linkedin.com/feed/update/urn:li:share:post-789",
  publishedAt: "2026-08-03T10:00:01.000Z",
}

const preflight = {
  runId: "run-123",
  revision: 3,
  artifactChecksum: "a".repeat(64),
  documentTitle: "Server-approved field guide",
  caption: "Server-approved caption for the public post.",
  pages: [1, 2, 3, 4, 5].map((index) => ({
    index,
    altText: `Server slide ${index}`,
    mimeType: "image/png" as const,
    checksum: String(index).repeat(64),
    previewUrl: `/api/linkedin/preflight/preview?runId=run-123&revision=3&index=${index}&checksum=${String(index).repeat(64)}`,
  })),
}

function connectionResponse(connection: object): Response {
  return Response.json(connection)
}

function errorResponse(
  code: string,
  status: number,
  message: string,
  retryAfterSeconds?: number,
): Response {
  return Response.json({
    error: { code, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) },
  }, { status })
}

function stubFetch(...responses: Array<Response | Promise<Response> | Error>) {
  return stubFetchForStatus({ state: "idle" }, ...responses)
}

function stubFetchForStatus(
  status: object,
  ...responses: Array<Response | Promise<Response> | Error>
) {
  const fetch = vi.fn<PublisherFetch>(async (input) => {
    if (String(input).startsWith("/api/linkedin/preflight?")) {
      const url = new URL(String(input), "http://localhost")
      return Response.json(preflightFor(
        url.searchParams.get("runId") ?? "",
        Number(url.searchParams.get("revision")),
      ))
    }
    if (String(input).startsWith("/api/linkedin/publish/status?")) {
      return Response.json(status)
    }
    const response = responses.shift()
    if (!response) throw new Error("Unexpected fetch")
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function preflightFor(runId: string, revision: number) {
  return {
    ...preflight,
    runId,
    revision,
    pages: preflight.pages.map((page) => ({
      ...page,
      previewUrl: `/api/linkedin/preflight/preview?runId=${encodeURIComponent(runId)}&revision=${revision}&index=${page.index}&checksum=${page.checksum}`,
    })),
  }
}

function deferredResponse() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
