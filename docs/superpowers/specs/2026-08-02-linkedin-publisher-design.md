# LinkedIn Document Publisher Design

**Date:** 2026-08-02  
**Status:** Approved design; implementation planning pending  
**Workstream:** LinkedIn Carousel Automation only

## Goal

Add a final, manual-only `LinkedIn Publisher` node to the carousel workflow. After a user reviews and approves a complete five-slide carousel, the dashboard can connect to the user's personal LinkedIn account through OAuth and publish the slides as one five-page PDF document post.

Publishing must never occur as part of `Run Workflow`, during tests, on page load, or without a final user confirmation.

## Current-state constraint

The inherited dashboard is presently a UI simulation. Its carousel previews are CSS-rendered fixtures, not real PNG or JPG artifacts. A CSS preview is not a valid publishing source.

The Publisher therefore accepts only a server-side approved-run manifest containing five real image artifacts. Until an upstream run supplies that manifest, the Publish control remains disabled and explains which artifacts are missing. The Publisher implementation must not silently screenshot the browser UI or treat fixture copy as a generated asset.

## Decisions

- Target: the OAuth-authenticated member's personal LinkedIn profile.
- Output format: one organic PDF document post containing exactly five square pages.
- Visibility: `PUBLIC`.
- Authentication: LinkedIn three-legged OAuth authorization-code flow.
- OAuth permissions: `openid profile w_member_social`, using the Sign In with LinkedIn using OpenID Connect and Share on LinkedIn products. Email access is not requested.
- Trigger: explicit user confirmation only.
- API location: server-only Next.js route handlers.
- Direct LinkedIn integration is the first adapter. A future n8n implementation may replace it behind the same publisher interface.
- Multi-image publishing, sponsored carousel publishing, organization-page publishing, scheduling, automatic retries after ambiguous post creation, and analytics are out of scope.

## User flow

1. `Run Workflow` executes discovery, research, writing, image generation, and review.
2. The workflow stops at `Review Carousel`.
3. `LinkedIn Publisher` remains a separate manual node and is never included in automatic simulation.
4. When LinkedIn is disconnected, the node exposes `Connect LinkedIn`.
5. Connecting redirects to LinkedIn, obtains member consent, validates OAuth state, exchanges the returned authorization code, and returns to the carousel workspace.
6. The publisher preflight validates the connection, approved revision, caption, and all five image artifacts.
7. When every preflight check passes, `Publish to LinkedIn` becomes available.
8. Clicking the button opens a confirmation dialog containing the authenticated member, five-page PDF preview, caption, public visibility, and final action.
9. Only the final confirmation calls the publish endpoint.
10. The node reports preparation, upload, publishing, success, or actionable failure.

## Workflow model

The carousel workflow gains a sixth node and fifth connection:

```text
Find Current News
  -> Synthesize Research
  -> Write Carousel Copy
  -> Visual Production
  -> Review Carousel
  -> LinkedIn Publisher (manual approval boundary)
```

The node definition gains an execution mode:

```ts
type NodeExecutionMode = "automatic" | "manual"
```

The simulation hook runs only automatic nodes. It must not queue, execute, or complete the manual publisher node. Publisher state is owned by the publishing feature rather than the workflow simulation hook.

## Publisher states

```ts
type LinkedInPublisherState =
  | "disconnected"
  | "locked"
  | "ready"
  | "preparing_pdf"
  | "registering_upload"
  | "uploading_document"
  | "creating_post"
  | "published"
  | "failed"
```

- `disconnected`: OAuth connection is absent or expired.
- `locked`: connected, but the approved run, caption, revision, or five assets are incomplete.
- `ready`: every server-side preflight check passes.
- `preparing_pdf`: generating and validating the PDF.
- `registering_upload`: obtaining a LinkedIn document upload target.
- `uploading_document`: transferring the PDF.
- `creating_post`: creating the public Posts API document post.
- `published`: a LinkedIn post ID and URL are stored for the approved revision.
- `failed`: a classified error is shown without destroying the approved run.

## Server-side contracts

The client submits only a run identifier, revision, and idempotency key:

```ts
interface PublishCarouselRequest {
  runId: string
  revision: number
  idempotencyKey: string
}
```

The server resolves the approved artifact manifest:

```ts
interface ApprovedCarouselRun {
  id: string
  revision: number
  status: "approved"
  caption: string
  documentTitle: string
  slides: CarouselSlideAsset[]
}

interface CarouselSlideAsset {
  id: string
  index: 1 | 2 | 3 | 4 | 5
  storageKey: string
  mimeType: "image/png" | "image/jpeg"
  width: 1080
  height: 1080
  altText: string
  checksum: string
}
```

The browser never supplies access tokens, LinkedIn author URNs, upload URLs, raw files, storage keys, post visibility, or arbitrary captions at publish time. The server derives these from the authenticated session and approved manifest.

## API routes

- `GET /api/linkedin/oauth/start`: creates cryptographically random OAuth state, stores it in a secure short-lived cookie, and redirects to LinkedIn.
- `GET /api/linkedin/oauth/callback`: validates state, handles denial/error parameters, exchanges the code, stores the encrypted credential session, and redirects to the carousel workspace.
- `GET /api/linkedin/connection`: returns a safe connection summary and expiry status without returning tokens.
- `POST /api/linkedin/publish`: performs preflight, idempotency lookup, PDF creation, document upload, Posts API creation, and result persistence.

OAuth secrets, tokens, authorization codes, raw LinkedIn responses, and upload URLs must never be included in client responses or application logs.

## OAuth credential handling

Required ignored environment variables:

```text
LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET
LINKEDIN_REDIRECT_URI
LINKEDIN_SESSION_SECRET
LINKEDIN_API_VERSION
```

The OAuth flow requests only `openid`, `profile`, and `w_member_social`: identity is required to show and bind the authenticated member, while `w_member_social` authorizes publishing. Email access is not requested. OAuth `state` is mandatory and must be compared using a timing-safe operation. The returned ID token is validated against LinkedIn's OpenID metadata and JWKS, including issuer, audience, signature, and expiry. The member subject is normalized into the personal author URN and stored with the encrypted credential. The access token, author URN, display summary, and expiry metadata are encrypted with authenticated encryption before being stored in an `HttpOnly`, `Secure` in production, `SameSite=Lax` session cookie.

The credential store is accessed through a `LinkedInCredentialStore` interface so production storage can later move to a database or secret-backed session without changing publisher orchestration.

Programmatic refresh tokens are not assumed. Before expiry, or after a LinkedIn authentication failure, the dashboard re-runs the authorization flow. A successful existing grant may bypass the consent screen when LinkedIn permits it.

## PDF generation

The PDF builder receives the five validated image byte streams from the artifact store. It creates five square pages in slide-index order, embeds each image without cropping, and attaches deterministic document metadata.

The builder must reject:

- a slide count other than five;
- duplicate or missing indices;
- unsupported MIME types;
- dimensions other than 1080 by 1080;
- checksum mismatches;
- empty or unreadable files;
- a generated document exceeding the configured LinkedIn upload limit.

PDF creation is deterministic for the same approved revision. The document checksum is stored with the publish record.

## LinkedIn adapter

```ts
interface LinkedInPublisher {
  publishDocument(input: {
    credential: LinkedInCredential
    authorUrn: string
    commentary: string
    documentTitle: string
    pdf: Uint8Array
    idempotencyKey: string
  }): Promise<LinkedInPublishResult>
}
```

The direct adapter:

1. initializes a LinkedIn document upload;
2. uploads the PDF to the returned upload URL;
3. creates a `PUBLIC` document post through the Posts API;
4. returns the post URN, safe post URL when derivable, and timestamps.

LinkedIn version and Rest.li protocol headers are set centrally. The implementation must use a currently supported `YYYYMM` API version supplied through configuration rather than hardcoding a version that will silently age out.

## Idempotency and concurrency

Every confirmation creates a stable idempotency key scoped to run ID and revision. The server records these states:

```ts
type PublishAttemptState = "started" | "document_uploaded" | "published" | "failed_safe" | "unknown"
```

- A completed key returns the existing result and never republishes.
- An in-progress key rejects concurrent clicks.
- A known safe failure may be retried with the same key.
- An ambiguous timeout after post creation moves to `unknown` and blocks automatic retry until reconciled.
- Changing the approved revision invalidates the previous ready state and requires a new confirmation and key.

## Error model

- `401`: missing, expired, or invalid LinkedIn connection; prompt reconnect.
- `403`: missing `w_member_social`, Share on LinkedIn product access, or author authorization.
- `409`: stale revision, duplicate/in-progress attempt, or unknown publish outcome.
- `422`: incomplete approval, invalid caption, missing assets, invalid dimensions, checksum failure, or PDF validation failure.
- `429`: LinkedIn rate limit; retain the approved run and show a retry-after message when provided.
- `502/503`: LinkedIn upload or Posts API failure; classify retry safety before exposing Retry.

Client-facing errors are stable application codes with safe messages. Provider payloads and credentials remain server-only.

## UI components

Carousel-only files live under:

```text
dashboard/src/features/carousel/publisher/
  linkedin-publisher-node.tsx
  linkedin-publisher-panel.tsx
  linkedin-publish-dialog.tsx
  linkedin-publisher-state.ts
  linkedin-publisher-client.ts
```

Server-only modules live under:

```text
dashboard/src/server/carousel-artifacts/
  artifact-store.ts
  approved-run.ts

dashboard/src/server/linkedin/
  oauth.ts
  credential-store.ts
  pdf-builder.ts
  publisher.ts
  linkedin-client.ts
  errors.ts
```

Shared workflow files receive only the minimal changes needed for a manual node mode, sixth carousel node, and publisher integration. Newsletter-specific files and behavior are out of scope and must not be modified.

## Testing

No automated test may contact LinkedIn or create a post.

Required coverage:

- fixture invariants for six carousel nodes and a manual publisher;
- simulation tests proving automatic execution stops after review;
- connection and locked/ready publisher UI states;
- confirmation dialog contents and cancellation;
- double-click and concurrent-request protection;
- OAuth start, callback, denial, state mismatch, exchange failure, and expiry handling;
- credential encryption and safe connection summaries;
- deterministic five-page PDF generation and invalid-asset rejection;
- LinkedIn adapter request shapes with mocked HTTP responses;
- route integration for success and every classified error;
- idempotent replay returning the original post result;
- unknown-outcome behavior preventing blind retry;
- lint, TypeScript, full unit/component test suite, and production build.

Manual verification uses a mocked LinkedIn adapter until the user explicitly connects a developer application and chooses to publish. Connecting OAuth alone must not publish.

## Definition of done

- The carousel canvas shows a sixth `LinkedIn Publisher` node as a manual approval boundary.
- `Run Workflow` cannot reach the publisher.
- OAuth connection and reconnection work without exposing credentials.
- Publish remains unavailable until the server validates an approved five-asset revision.
- The confirmation dialog makes the final external action explicit.
- A confirmed request produces one deterministic five-page PDF and one LinkedIn document post through the adapter.
- Duplicate clicks cannot create duplicate posts.
- Success and failure states are understandable and recoverable where safe.
- Newsletter code remains isolated and unchanged.
- All required automated and manual verification passes without performing a live publish during development.

## Official references

- LinkedIn three-legged OAuth: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- LinkedIn authentication overview: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
- Sign In with LinkedIn using OpenID Connect: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- LinkedIn Documents API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api
- LinkedIn Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
