export const LINKEDIN_PROVIDER_TIMEOUT_MS = 15_000

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export async function fetchLinkedInProvider(
  fetchImplementation: FetchImplementation,
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = LINKEDIN_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const upstreamSignal = init.signal
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal?.aborted) abortFromUpstream()
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true })

  const timeout = setTimeout(() => {
    controller.abort(new DOMException("LinkedIn provider request timed out", "TimeoutError"))
  }, timeoutMs)

  try {
    return await fetchImplementation(input, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
    upstreamSignal?.removeEventListener("abort", abortFromUpstream)
  }
}
