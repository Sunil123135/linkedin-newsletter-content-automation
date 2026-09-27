import { describe, expect, it, vi } from "vitest"

import { publishNewsletterWithResend } from "./newsletter-publisher"

describe("publishNewsletterWithResend", () => {
  it("sends only to the server-configured fixed recipient", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )

    const result = await publishNewsletterWithResend({
      apiKey: "server-secret",
      recipient: "fixed-recipient@example.com",
      fetcher,
    })

    expect(result).toEqual({ messageId: "email-123" })
    const request = fetcher.mock.calls[0]
    expect(request[0]).toBe("https://api.resend.com/emails")
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({
      to: ["fixed-recipient@example.com"],
      subject: "The systems behind dependable AI agents",
    })
  })

  it("returns an actionable error without exposing the provider response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "sensitive provider detail" }), {
        status: 422,
      })
    )

    await expect(
      publishNewsletterWithResend({
        apiKey: "server-secret",
        recipient: "fixed-recipient@example.com",
        fetcher,
      })
    ).rejects.toThrow("Resend could not publish the newsletter")
  })
})
