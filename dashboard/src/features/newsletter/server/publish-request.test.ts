import { describe, expect, it, vi } from "vitest"

import { handleNewsletterPublishRequest } from "./publish-request"

const validRequest = () =>
  new Request("http://localhost/api/newsletter/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newsletterId: "issue-014" }),
  })

describe("handleNewsletterPublishRequest", () => {
  it("rejects arbitrary client recipients before invoking the provider", async () => {
    const publish = vi.fn()
    const request = new Request("http://localhost/api/newsletter/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        newsletterId: "issue-014",
        recipient: "attacker@example.com",
      }),
    })

    const response = await handleNewsletterPublishRequest(request, {
      env: {
        RESEND_API_KEY: "server-secret",
        NEWSLETTER_TEST_RECIPIENT: "fixed-recipient@example.com",
      },
      publish,
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "The publish request contains unsupported fields.",
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it("fails safely when server configuration is incomplete", async () => {
    const publish = vi.fn()
    const response = await handleNewsletterPublishRequest(validRequest(), {
      env: { RESEND_API_KEY: "server-secret" },
      publish,
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "Newsletter publishing is not configured.",
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it("publishes with server-only configuration and returns the message id", async () => {
    const publish = vi.fn().mockResolvedValue({ messageId: "email-123" })
    const response = await handleNewsletterPublishRequest(validRequest(), {
      env: {
        RESEND_API_KEY: "server-secret",
        NEWSLETTER_TEST_RECIPIENT: "fixed-recipient@example.com",
      },
      publish,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ messageId: "email-123" })
    expect(publish).toHaveBeenCalledWith({
      apiKey: "server-secret",
      recipient: "fixed-recipient@example.com",
    })
  })

  it("maps provider failure to an actionable retry response", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("provider detail"))
    const response = await handleNewsletterPublishRequest(validRequest(), {
      env: {
        RESEND_API_KEY: "server-secret",
        NEWSLETTER_TEST_RECIPIENT: "fixed-recipient@example.com",
      },
      publish,
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: "Publishing failed. Check the server configuration and try again.",
    })
  })
})
