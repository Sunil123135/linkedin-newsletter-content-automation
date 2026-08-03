import { describe, expect, it, vi } from "vitest"
import { LinkedInError } from "./errors"
import { LinkedInClient } from "./linkedin-client"

const accessToken = "access-token"
const apiVersion = "202608"
const author = "urn:li:person:member-123"
const documentUrn = "urn:li:document:document-456"
const uploadUrl = "https://www.linkedin.com/dms-uploads/sp/v1/document-upload"
const initializeUrl = "https://api.linkedin.com/rest/documents?action=initializeUpload"
const postsUrl = "https://api.linkedin.com/rest/posts"

describe("LinkedInClient", () => {
  it("initializes a document upload for the personal author using only the supported owner field", async () => {
    const fetch = fetchFixture(jsonResponse(initializedDocumentResponse()))
    const client = createClient(fetch)

    await expect(client.initializeDocumentUpload({ owner: author })).resolves.toEqual({
      documentUrn,
      uploadUrl,
    })

    expect(fetch).toHaveBeenCalledWith(initializeUrl, {
      method: "POST",
      headers: restJsonHeaders(),
      redirect: "manual",
      signal: expect.any(Object),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: author,
        },
      }),
    })
  })

  it("uploads PDF bytes to the returned upload URL", async () => {
    const fetch = fetchFixture(new Response(null, { status: 201 }))
    const client = createClient(fetch)
    const pdf = new Uint8Array([37, 80, 68, 70])

    await expect(client.uploadDocument(uploadUrl, pdf)).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledWith(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
      },
      redirect: "manual",
      signal: expect.any(Object),
      body: pdf,
    })
  })

  it("creates a public document post with commentary and title", async () => {
    const fetch = fetchFixture(new Response(null, {
      status: 201,
      headers: { "x-restli-id": "urn:li:share:post-789" },
    }))
    const client = createClient(fetch)

    await expect(client.createDocumentPost({
      author,
      commentary: "Practical ways to build better systems.",
      documentUrn,
      documentTitle: "Engineering field notes",
    })).resolves.toEqual({ postUrn: "urn:li:share:post-789" })

    expect(fetch).toHaveBeenCalledWith(postsUrl, {
      method: "POST",
      headers: restJsonHeaders(),
      redirect: "manual",
      signal: expect.any(Object),
      body: JSON.stringify({
        author,
        commentary: "Practical ways to build better systems.",
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            id: documentUrn,
            title: "Engineering field notes",
          },
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    })
  })

  it("sends Authorization, LinkedIn-Version, and X-Restli-Protocol-Version on REST calls", async () => {
    const fetch = fetchFixture(
      jsonResponse(initializedDocumentResponse()),
      new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:post-789" } }),
    )
    const client = createClient(fetch)

    await client.initializeDocumentUpload({ owner: author })
    await client.createDocumentPost({
      author,
      commentary: "Commentary",
      documentUrn,
      documentTitle: "Title",
    })

    for (const [, request] of fetch.mock.calls) {
      expect(request?.headers).toMatchObject({
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": apiVersion,
        "X-Restli-Protocol-Version": "2.0.0",
      })
    }
  })

  it("sends Authorization and application/pdf on the signed upload request", async () => {
    const fetch = fetchFixture(new Response(null, { status: 201 }))
    const client = createClient(fetch)

    await client.uploadDocument(uploadUrl, new Uint8Array([1]))

    expect(fetch).toHaveBeenCalledWith(uploadUrl, expect.objectContaining({
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
      },
    }))
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty("LinkedIn-Version")
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty("X-Restli-Protocol-Version")
  })

  it.each([
    "http://www.linkedin.com/dms-uploads/document",
    "https://user:password@www.linkedin.com/dms-uploads/document",
    "https://www.linkedin.com:444/dms-uploads/document",
    "https://www.linkedin.com/dms-uploads/document#fragment",
    "https://www.linkedin.com.attacker.example/dms-uploads/document",
    "https://api.linkedin.com/dms-uploads/document",
    "https://www.linkedin.com/not-dms-uploads/document",
  ])("rejects an untrusted document upload URL before sending Authorization: %s", async (untrustedUrl) => {
    const fetch = fetchFixture(new Response(null, { status: 201 }))
    const client = createClient(fetch)

    await expect(client.uploadDocument(untrustedUrl, new Uint8Array([1])))
      .rejects.toMatchObject({ code: "INVALID_UPSTREAM_RESPONSE" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects an upload redirect without forwarding Authorization", async () => {
    const fetch = fetchFixture(new Response(null, {
      status: 307,
      headers: { location: "https://attacker.example/collect" },
    }))
    const client = createClient(fetch)

    await expect(client.uploadDocument(uploadUrl, new Uint8Array([1])))
      .rejects.toMatchObject({ code: "INVALID_UPSTREAM_RESPONSE" })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" })
  })

  it("aborts a provider request at the configured deadline", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      })
    )) as unknown as ReturnType<typeof vi.fn> & typeof globalThis.fetch
    const client = new LinkedInClient({ accessToken, apiVersion, fetch, timeoutMs: 25 })

    const pending = client.initializeDocumentUpload({ owner: author })
    const rejection = expect(pending).rejects.toMatchObject({ code: "LINKEDIN_UNAVAILABLE" })
    await vi.advanceTimersByTimeAsync(25)

    await rejection
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    vi.useRealTimers()
  })

  it("maps 401 to AUTH_REQUIRED", async () => {
    const client = createClient(fetchFixture(new Response(null, { status: 401 })))

    await expect(client.initializeDocumentUpload({ owner: author })).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    } satisfies Partial<LinkedInError>)
  })

  it("maps 403 to INSUFFICIENT_SCOPE", async () => {
    const client = createClient(fetchFixture(new Response(null, { status: 403 })))

    await expect(client.uploadDocument(uploadUrl, new Uint8Array([1]))).rejects.toMatchObject({
      code: "INSUFFICIENT_SCOPE",
    } satisfies Partial<LinkedInError>)
  })

  it("maps 429 and Retry-After to RATE_LIMITED", async () => {
    const client = createClient(fetchFixture(new Response(null, {
      status: 429,
      headers: { "Retry-After": "60" },
    })))

    const error = await rejectedLinkedInError(client.createDocumentPost({
      author,
      commentary: "Commentary",
      documentUrn,
      documentTitle: "Title",
    }))

    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 60,
    } satisfies Partial<LinkedInError>)
  })

  it("does not expose missing or invalid Retry-After values", async () => {
    for (const retryAfter of [null, "sixty", "1.5", "-1", "9007199254740992"]) {
      const client = createClient(fetchFixture(new Response(null, {
        status: 429,
        headers: retryAfter === null ? undefined : { "Retry-After": retryAfter },
      })))

      const error = await rejectedLinkedInError(client.createDocumentPost({
        author,
        commentary: "Commentary",
        documentUrn,
        documentTitle: "Title",
      }))

      expect(error).toMatchObject({ code: "RATE_LIMITED" } satisfies Partial<LinkedInError>)
      expect(error).not.toHaveProperty("retryAfterSeconds")
    }
  })

  it("maps LinkedIn 5xx to LINKEDIN_UNAVAILABLE", async () => {
    const client = createClient(fetchFixture(new Response(null, { status: 503 })))

    await expect(client.initializeDocumentUpload({ owner: author })).rejects.toMatchObject({
      code: "LINKEDIN_UNAVAILABLE",
    } satisfies Partial<LinkedInError>)
  })

  it("rejects malformed initialization JSON before reading its fields", async () => {
    const client = createClient(fetchFixture(jsonResponse({ value: { document: documentUrn } })))

    await expect(client.initializeDocumentUpload({ owner: author })).rejects.toMatchObject({
      code: "INVALID_UPSTREAM_RESPONSE",
    } satisfies Partial<LinkedInError>)
  })

  it("rejects a successful post response without the x-restli-id header", async () => {
    const client = createClient(fetchFixture(new Response(null, { status: 201 })))

    await expect(client.createDocumentPost({
      author,
      commentary: "Commentary",
      documentUrn,
      documentTitle: "Title",
    })).rejects.toMatchObject({ code: "INVALID_UPSTREAM_RESPONSE" } satisfies Partial<LinkedInError>)
  })

  it("marks a network failure during post creation as UNKNOWN_OUTCOME", async () => {
    const fetch = fetchFixture(Promise.reject(new TypeError("network disconnected")))
    const client = createClient(fetch)

    await expect(client.createDocumentPost({
      author,
      commentary: "Commentary",
      documentUrn,
      documentTitle: "Title",
    })).rejects.toMatchObject({ code: "UNKNOWN_OUTCOME" } satisfies Partial<LinkedInError>)
  })
})

function createClient(fetch: typeof globalThis.fetch): LinkedInClient {
  return new LinkedInClient({ accessToken, apiVersion, fetch })
}

function fetchFixture(...responses: Array<Response | Promise<Response>>): ReturnType<typeof vi.fn> & typeof globalThis.fetch {
  return vi.fn(async () => {
    const response = responses.shift()
    if (!response) {
      throw new Error("Unexpected fetch request")
    }
    return await response
  }) as ReturnType<typeof vi.fn> & typeof globalThis.fetch
}

function initializedDocumentResponse() {
  return {
    value: {
      document: documentUrn,
      uploadUrl,
    },
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function restJsonHeaders() {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": apiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  }
}

async function rejectedLinkedInError(promise: Promise<unknown>): Promise<LinkedInError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(LinkedInError)
    return error as LinkedInError
  }

  throw new Error("Expected LinkedInError rejection")
}
