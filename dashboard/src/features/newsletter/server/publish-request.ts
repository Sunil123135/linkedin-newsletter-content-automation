import { publishNewsletterWithResend } from "./newsletter-publisher"

type Publish = (input: {
  apiKey: string
  recipient: string
}) => Promise<{ messageId: string }>

type NewsletterEnvironment = {
  RESEND_API_KEY?: string
  NEWSLETTER_TEST_RECIPIENT?: string
}

export async function handleNewsletterPublishRequest(
  request: Request,
  {
    env,
    publish = publishNewsletterWithResend,
  }: {
    env: NewsletterEnvironment
    publish?: Publish
  }
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "The publish request is invalid." }, { status: 400 })
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("newsletterId" in body) ||
    body.newsletterId !== "issue-014"
  ) {
    return Response.json(
      { error: "The publish request contains unsupported fields." },
      { status: 400 }
    )
  }

  const apiKey = env.RESEND_API_KEY?.trim()
  const recipient = env.NEWSLETTER_TEST_RECIPIENT?.trim()
  if (!apiKey || !recipient) {
    return Response.json(
      { error: "Newsletter publishing is not configured." },
      { status: 503 }
    )
  }

  try {
    const result = await publish({ apiKey, recipient })
    return Response.json(result)
  } catch {
    return Response.json(
      { error: "Publishing failed. Check the server configuration and try again." },
      { status: 502 }
    )
  }
}
