import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NewsletterPublishControl } from "./newsletter-publish-control"

afterEach(() => vi.unstubAllGlobals())

describe("NewsletterPublishControl", () => {
  it("does not offer publishing before editorial review is complete", () => {
    render(<NewsletterPublishControl reviewReady={false} />)

    expect(screen.queryByRole("button", { name: "Publish newsletter" })).not.toBeInTheDocument()
    expect(screen.getByText("Complete editorial review to unlock publishing.")).toBeVisible()
  })

  it("requires confirmation and shows success after the server accepts publishing", async () => {
    const user = userEvent.setup()
    let resolveRequest!: (response: Response) => void
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve))
    )
    vi.stubGlobal("fetch", fetcher)
    render(<NewsletterPublishControl reviewReady />)

    await user.click(screen.getByRole("button", { name: "Publish newsletter" }))
    expect(screen.getByRole("alertdialog")).toBeVisible()
    expect(screen.getByText(/fixed test recipient configured on the server/i)).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Confirm publish" }))
    expect(screen.getByRole("button", { name: "Publishing…" })).toBeDisabled()

    resolveRequest(
      new Response(JSON.stringify({ messageId: "email-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    expect(await screen.findByText("Newsletter published successfully.")).toBeVisible()
    expect(fetcher).toHaveBeenCalledWith("/api/newsletter/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newsletterId: "issue-014" }),
    })
  })

  it("shows a retryable error when publishing fails", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Publishing is unavailable." }), {
          status: 503,
          headers: { "content-type": "application/json" },
        })
      )
    )
    render(<NewsletterPublishControl reviewReady />)

    await user.click(screen.getByRole("button", { name: "Publish newsletter" }))
    await user.click(screen.getByRole("button", { name: "Confirm publish" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Publishing is unavailable.")
    expect(screen.getByRole("button", { name: "Try publishing again" })).toBeVisible()
  })
})
