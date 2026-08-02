import { z } from "zod"
import { LinkedInError } from "./errors"

const initializedDocumentSchema = z.object({
  value: z.object({
    document: z.string().min(1),
    uploadUrl: z.url(),
  }),
})

export interface LinkedInClientOptions {
  accessToken: string
  apiVersion: string
  fetch: typeof globalThis.fetch
}

export interface InitializeDocumentInput {
  owner: string
}

export interface InitializedDocument {
  documentUrn: string
  uploadUrl: string
}

export interface CreateDocumentPostInput {
  author: string
  commentary: string
  documentUrn: string
  documentTitle: string
}

export class LinkedInClient {
  private readonly restJsonHeaders: Record<string, string>

  constructor(private readonly options: LinkedInClientOptions) {
    this.restJsonHeaders = {
      Authorization: `Bearer ${options.accessToken}`,
      "LinkedIn-Version": options.apiVersion,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    }
  }

  async initializeDocumentUpload(input: InitializeDocumentInput): Promise<InitializedDocument> {
    const response = await this.request(
      "https://api.linkedin.com/rest/documents?action=initializeUpload",
      {
        method: "POST",
        headers: this.restJsonHeaders,
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: input.owner,
          },
        }),
      },
    )

    const parsed = await this.parseInitializedDocument(response)
    return {
      documentUrn: parsed.value.document,
      uploadUrl: parsed.value.uploadUrl,
    }
  }

  async uploadDocument(uploadUrl: string, pdf: Uint8Array): Promise<void> {
    await this.request(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        "Content-Type": "application/pdf",
      },
      // Fetch accepts Uint8Array as raw binary data; BodyInit's DOM typing is narrower.
      body: pdf as unknown as BodyInit,
    })
  }

  async createDocumentPost(input: CreateDocumentPostInput): Promise<{ postUrn: string }> {
    let response: Response
    try {
      response = await this.options.fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: this.restJsonHeaders,
        body: JSON.stringify({
          author: input.author,
          commentary: input.commentary,
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          content: {
            media: {
              id: input.documentUrn,
              title: input.documentTitle,
            },
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      })
    } catch (cause) {
      throw new LinkedInError(
        "UNKNOWN_OUTCOME",
        "LinkedIn may have accepted the post. Check LinkedIn before retrying.",
        cause,
      )
    }

    this.throwForUnsuccessfulResponse(response)

    const postUrn = response.headers.get("x-restli-id")
    if (!postUrn) {
      throw unavailableFailure()
    }

    return { postUrn }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.options.fetch(url, init)
    } catch (cause) {
      throw unavailableFailure(cause)
    }

    this.throwForUnsuccessfulResponse(response)
    return response
  }

  private throwForUnsuccessfulResponse(response: Response): void {
    if (response.ok) {
      return
    }

    if (response.status === 401) {
      throw new LinkedInError("AUTH_REQUIRED", "Reconnect LinkedIn and try again.")
    }
    if (response.status === 403) {
      throw new LinkedInError("INSUFFICIENT_SCOPE", "LinkedIn access is missing the required publishing scope.")
    }
    if (response.status === 429) {
      throw new LinkedInError(
        "RATE_LIMITED",
        "LinkedIn is rate limiting requests. Please retry later.",
        undefined,
        { retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("Retry-After")) },
      )
    }
    if (response.status >= 500 && response.status <= 599) {
      throw unavailableFailure()
    }

    throw unavailableFailure()
  }

  private async parseInitializedDocument(response: Response): Promise<z.infer<typeof initializedDocumentSchema>> {
    try {
      const payload: unknown = await response.json()
      const parsed = initializedDocumentSchema.safeParse(payload)
      if (!parsed.success) {
        throw unavailableFailure(parsed.error)
      }
      return parsed.data
    } catch (cause) {
      if (cause instanceof LinkedInError) {
        throw cause
      }
      throw unavailableFailure(cause)
    }
  }
}

function unavailableFailure(cause?: unknown): LinkedInError {
  return new LinkedInError(
    "LINKEDIN_UNAVAILABLE",
    "LinkedIn is temporarily unavailable. Please try again later.",
    cause,
  )
}

function parseRetryAfterSeconds(retryAfter: string | null): number | undefined {
  if (retryAfter === null || !/^\d+$/.test(retryAfter)) {
    return undefined
  }

  const seconds = Number(retryAfter)
  return Number.isSafeInteger(seconds) ? seconds : undefined
}
