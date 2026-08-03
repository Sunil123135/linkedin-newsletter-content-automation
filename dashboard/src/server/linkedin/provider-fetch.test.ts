import { afterEach, describe, expect, it, vi } from "vitest"

import {
  LINKEDIN_PROVIDER_TIMEOUT_MS,
  fetchLinkedInProvider,
} from "./provider-fetch"

afterEach(() => {
  vi.useRealTimers()
})

describe("fetchLinkedInProvider", () => {
  it("uses manual redirect handling and an explicit abort deadline", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true })
      })
    }) as unknown as typeof globalThis.fetch

    const pending = fetchLinkedInProvider(fetch, "https://api.linkedin.com/rest/posts", {
      method: "POST",
    }, 25)
    const rejection = expect(pending).rejects.toMatchObject({ name: "TimeoutError" })
    await vi.advanceTimersByTimeAsync(25)

    await rejection
    expect(signal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledWith("https://api.linkedin.com/rest/posts", {
      method: "POST",
      redirect: "manual",
      signal: expect.any(Object),
    })
  })

  it("publishes a finite default provider timeout", () => {
    expect(LINKEDIN_PROVIDER_TIMEOUT_MS).toBeGreaterThan(0)
    expect(LINKEDIN_PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })

  it("keeps the deadline active while a response body is being consumed", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true })
        },
      })))
    }) as unknown as typeof globalThis.fetch

    const pending = fetchLinkedInProvider(
      fetch,
      "https://api.linkedin.com/rest/posts",
      undefined,
      25,
    )
    const rejection = expect(pending).rejects.toMatchObject({ name: "TimeoutError" })
    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })
})
