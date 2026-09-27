import { handleNewsletterPublishRequest } from "@/features/newsletter/server/publish-request"

export async function POST(request: Request) {
  return handleNewsletterPublishRequest(request, {
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      NEWSLETTER_TEST_RECIPIENT: process.env.NEWSLETTER_TEST_RECIPIENT,
    },
  })
}
