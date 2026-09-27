import { NEWSLETTER_ARTICLE } from "../newsletter-fixtures"

const RESEND_ENDPOINT = "https://api.resend.com/emails"
const FROM_ADDRESS = "Automation Studio <onboarding@resend.dev>"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function renderNewsletterHtml() {
  const article = NEWSLETTER_ARTICLE
  const sections = article.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`
    )
    .join("")

  return `<article><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.deck)}</p>${sections}</article>`
}

export async function publishNewsletterWithResend({
  apiKey,
  recipient,
  fetcher = fetch,
}: {
  apiKey: string
  recipient: string
  fetcher?: typeof fetch
}): Promise<{ messageId: string }> {
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [recipient],
      subject: NEWSLETTER_ARTICLE.title,
      html: renderNewsletterHtml(),
    }),
  })

  if (!response.ok) {
    throw new Error("Resend could not publish the newsletter")
  }

  const body = (await response.json()) as { id?: unknown }
  if (typeof body.id !== "string" || !body.id) {
    throw new Error("Resend returned an invalid publish response")
  }

  return { messageId: body.id }
}
