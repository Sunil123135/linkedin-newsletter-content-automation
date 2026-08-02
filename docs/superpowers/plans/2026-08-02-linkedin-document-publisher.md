# LinkedIn Document Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, approval-gated LinkedIn Publisher node that converts one approved five-slide carousel run into a deterministic PDF and publishes it to the connected personal LinkedIn profile only after an explicit confirmation.

**Architecture:** The existing carousel simulation remains an automatic five-node workflow. A sixth manual Publisher node is rendered on the canvas but excluded from `Run Workflow`. Server-only modules validate an approved artifact manifest, build a five-page PDF, manage LinkedIn OAuth credentials, call LinkedIn's Documents and Posts APIs, and persist idempotency state. Thin Next.js route handlers expose OAuth, connection, and publish endpoints; client components never receive tokens or secrets.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Vitest, Testing Library, Zod, `pdf-lib`, `jose`, Node.js `crypto`, existing shadcn/TweakCN components, LinkedIn OpenID Connect + REST APIs.

## Global Constraints

- Publish only a five-page PDF document carousel to the connected personal LinkedIn profile.
- The Publisher node is always manual. `Run Workflow` must never call a LinkedIn endpoint.
- Require a server-side run whose current revision is explicitly `approved`; CSS preview fixtures are never publishable artifacts.
- Require exactly five ordered 1080×1080 PNG/JPEG assets with matching checksums before PDF generation.
- Use OAuth scopes `openid profile w_member_social`; do not request email access.
- Keep access tokens encrypted, server-side, and in an `HttpOnly`, `SameSite=Lax`, production-`Secure` cookie through the credential-store abstraction.
- Use a timing-safe OAuth state check and validate the ID token signature, issuer, audience, and expiry against LinkedIn JWKS.
- Send public-visibility posts only after the final confirmation dialog.
- Make publish retries idempotent and surface an `unknown` result instead of risking a duplicate when the post-creation outcome cannot be proven.
- Centralize LinkedIn API version headers and read the version from `LINKEDIN_API_VERSION`.
- Treat LinkedIn's current Documents, Posts, OIDC, and 3-legged OAuth documentation as the external contract; do not copy request fields from older UGC Posts or Assets APIs.
- Never make live OAuth, document upload, or post calls in automated tests.
- Do not modify Newsletter workflow files except shared types/components that are proven backward-compatible by Newsletter tests.

---

## Task 1: Establish publisher contracts and the five-slide workflow model

**Files:**

- Modify: `dashboard/package.json`
- Modify: `dashboard/pnpm-lock.yaml`
- Modify: `dashboard/src/features/automation/types.ts`
- Modify: `dashboard/src/features/automation/workflow-fixtures.ts`
- Modify: `dashboard/src/features/automation/workflow-fixtures.test.ts`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-state.ts`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-state.test.ts`
- Create: `dashboard/src/server/carousel-artifacts/approved-run.ts`

- [ ] **Step 1: Install the two narrowly scoped server dependencies**

Run:

```powershell
pnpm add pdf-lib jose
```

Expected: `package.json` and `pnpm-lock.yaml` add `pdf-lib` and `jose`; no other dependency is upgraded.

- [ ] **Step 2: Write failing workflow-contract tests**

Add assertions to `workflow-fixtures.test.ts`:

```ts
it("models a five-step automatic carousel plus a manual publisher", () => {
  expect(CAROUSEL_SLIDES).toHaveLength(5)
  expect(CAROUSEL_WORKFLOW.nodes.map((node) => node.id)).toEqual([
    "source",
    "research",
    "writer",
    "visual",
    "review",
    "publisher",
  ])
  expect(CAROUSEL_WORKFLOW.nodes.at(-1)?.executionMode).toBe("manual")
  expect(CAROUSEL_WORKFLOW.connections.at(-1)).toMatchObject({
    from: "review",
    to: "publisher",
  })
  expect(NEWSLETTER_WORKFLOW.nodes).toHaveLength(5)
  expect(NEWSLETTER_WORKFLOW.nodes.some((node) => node.id === "publisher")).toBe(false)
})
```

Create `linkedin-publisher-state.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { toCanvasExecutionStatus } from "./linkedin-publisher-state"

describe("toCanvasExecutionStatus", () => {
  it.each([
    ["disconnected", "idle"],
    ["locked", "idle"],
    ["ready", "idle"],
    ["preparing_pdf", "running"],
    ["registering_upload", "running"],
    ["uploading_document", "running"],
    ["creating_post", "running"],
    ["published", "completed"],
    ["failed", "error"],
  ] as const)("maps %s to %s", (state, expected) => {
    expect(toCanvasExecutionStatus(state)).toBe(expected)
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail for the missing contracts**

Run:

```powershell
pnpm test -- src/features/automation/workflow-fixtures.test.ts src/features/carousel/publisher/linkedin-publisher-state.test.ts
```

Expected: FAIL because `publisher`, `executionMode`, and publisher-state exports do not exist and the fixture still contains eight slides.

- [ ] **Step 4: Add the client-safe publisher and workflow types**

In `automation/types.ts`, add:

```ts
export type NodeId =
  | "source"
  | "research"
  | "writer"
  | "visual"
  | "review"
  | "publisher"

export type NodeExecutionMode = "automatic" | "manual"

export interface WorkflowNodeDefinition {
  id: NodeId
  executionMode: NodeExecutionMode
  label: string
  provider: string
  description: string
  input: string
  output: string
  result: string
  position: { x: number; y: number }
  icon: "search" | "brain" | "write" | "image" | "review" | "publish"
}
```

Create `linkedin-publisher-state.ts` with the exact public state machine and request contract:

```ts
import type { ExecutionStatus } from "@/features/automation/types"

export type LinkedInPublisherState =
  | "disconnected"
  | "locked"
  | "ready"
  | "preparing_pdf"
  | "registering_upload"
  | "uploading_document"
  | "creating_post"
  | "published"
  | "failed"

export interface PublishCarouselRequest {
  runId: string
  revision: number
  idempotencyKey: string
}

export function toCanvasExecutionStatus(
  state: LinkedInPublisherState,
): ExecutionStatus {
  if (state === "published") return "completed"
  if (state === "failed") return "error"
  if (
    state === "preparing_pdf" ||
    state === "registering_upload" ||
    state === "uploading_document" ||
    state === "creating_post"
  ) return "running"
  return "idle"
}
```

- [ ] **Step 5: Add the server-side approved artifact contract**

Create `approved-run.ts`:

```ts
import { z } from "zod"

export const carouselSlideAssetSchema = z.object({
  id: z.string().min(1),
  index: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  storageKey: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.literal(1080),
  height: z.literal(1080),
  altText: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
})

export const approvedCarouselRunSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.literal("approved"),
  caption: z.string().min(1).max(3000),
  documentTitle: z.string().min(1).max(200),
  slides: z.array(carouselSlideAssetSchema).length(5),
}).superRefine((run, context) => {
  const indexes = run.slides.map((slide) => slide.index)
  if (indexes.join(",") !== "1,2,3,4,5") {
    context.addIssue({ code: "custom", path: ["slides"], message: "Slides must be ordered 1 through 5" })
  }
})

export type ApprovedCarouselRun = z.infer<typeof approvedCarouselRunSchema>
export type CarouselSlideAsset = z.infer<typeof carouselSlideAssetSchema>
```

- [ ] **Step 6: Update fixtures without changing Newsletter semantics**

Set every existing node's `executionMode` to `"automatic"`. Keep the first five carousel slides, remove the last three, append this carousel-only node and connection:

```ts
{
  id: "publisher",
  executionMode: "manual",
  label: "LinkedIn Publisher",
  provider: "LinkedIn",
  description: "Publishes the approved five-page PDF after confirmation.",
  input: "Approved five-slide artifact manifest",
  output: "Public LinkedIn document post",
  result: "Waiting for approval",
  position: { x: 73, y: 66 },
  icon: "publish",
}
```

The final connection is:

```ts
{
  id: "review-publisher",
  from: "review",
  to: "publisher",
  path: "M708 392 C718 392 720 392 730 392",
}
```

Refactor the shared ordered-ID constant into workflow-specific arrays so Newsletter remains five nodes. Change carousel copy from `eight-slide`/`8 slides drafted`/`8 images generated` to `five-slide`/`5 slides drafted`/`5 images generated`; no eight-slide language may remain in the carousel fixture.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
pnpm test -- src/features/automation/workflow-fixtures.test.ts src/features/carousel/publisher/linkedin-publisher-state.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the contracts**

```powershell
git add dashboard/package.json dashboard/pnpm-lock.yaml dashboard/src/features/automation dashboard/src/features/carousel/publisher dashboard/src/server/carousel-artifacts/approved-run.ts
git commit -m "feat: define LinkedIn publisher contracts"
```

---

## Task 2: Keep the Publisher node out of automatic execution

**Files:**

- Modify: `dashboard/src/features/automation/use-workflow-simulation.ts`
- Modify: `dashboard/src/features/automation/use-workflow-simulation.test.tsx`
- Modify: `dashboard/src/features/automation/workflow-node.tsx`
- Modify: `dashboard/src/features/automation/workflow-node.test.tsx`
- Modify: `dashboard/src/features/automation/workflow-canvas.tsx`

- [ ] **Step 1: Write a failing simulation test**

Add a carousel-specific test using fake timers:

```ts
it("runs automatic nodes but leaves the manual publisher idle", async () => {
  const { result } = renderHook(() =>
    useWorkflowSimulation(CAROUSEL_WORKFLOW.nodes, CAROUSEL_WORKFLOW.connections),
  )

  act(() => result.current.run())
  await act(async () => vi.runAllTimersAsync())

  expect(result.current.statuses.publisher).toBe("idle")
  expect(result.current.statuses.review).toBe("completed")
  expect(result.current.activeConnectionId).toBeNull()
  expect(result.current.isRunning).toBe(false)
})
```

- [ ] **Step 2: Write a failing manual-node rendering test**

In `workflow-node.test.tsx`, render the Publisher definition and assert:

```ts
expect(screen.getByText("LinkedIn Publisher")).toBeInTheDocument()
expect(screen.getByText("Manual")).toBeInTheDocument()
expect(screen.getByLabelText("LinkedIn Publisher node")).toHaveAttribute(
  "data-execution-mode",
  "manual",
)
```

- [ ] **Step 3: Confirm the current implementation fails**

Run:

```powershell
pnpm test -- src/features/automation/use-workflow-simulation.test.tsx src/features/automation/workflow-node.test.tsx
```

Expected: FAIL because the simulator iterates over all nodes and the node has no manual badge or publish icon.

- [ ] **Step 4: Filter automatic nodes inside the simulator**

Derive the execution sequence once:

```ts
const automaticNodes = useMemo(
  () => nodes.filter((node) => node.executionMode === "automatic"),
  [nodes],
)
```

Make `buildStatuses` return a sound `Record<NodeId, ExecutionStatus>` by seeding every known ID:

```ts
const IDLE_STATUSES: Record<NodeId, ExecutionStatus> = {
  source: "idle",
  research: "idle",
  writer: "idle",
  visual: "idle",
  review: "idle",
  publisher: "idle",
}
```

When a run starts, set the first automatic node to `running`, the remaining automatic nodes to `queued`, and manual nodes to `idle`. Loop only over `automaticNodes`. Activate a connection only when both endpoints are automatic; this prevents `review-publisher` from animating during `Run Workflow`.

- [ ] **Step 5: Render the manual node distinctly**

Add `SendIcon` to the icon map, set `data-execution-mode`, and show a compact `Manual` badge beside the provider for manual nodes. Keep the existing source/target ports so the node still reads as part of the flow.

Replace the canvas header's hard-coded `5 nodes · 4 connections` with `${workflow.nodes.length} nodes · ${workflow.connections.length} connections` so the carousel reads `6 nodes · 5 connections` and Newsletter remains `5 nodes · 4 connections`.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
pnpm test -- src/features/automation/use-workflow-simulation.test.tsx src/features/automation/workflow-node.test.tsx src/features/automation/workflow-canvas.test.tsx
```

Expected: PASS, including existing Newsletter canvas coverage.

- [ ] **Step 7: Commit the execution boundary**

```powershell
git add dashboard/src/features/automation
git commit -m "feat: make LinkedIn publisher a manual workflow node"
```

---

## Task 3: Validate and load approved carousel artifacts server-side

**Files:**

- Create: `dashboard/src/server/carousel-artifacts/artifact-store.ts`
- Create: `dashboard/src/server/carousel-artifacts/artifact-store.test.ts`
- Modify: `dashboard/.gitignore`
- Create: `dashboard/.env.example`

- [ ] **Step 1: Write artifact-store tests using a temporary directory**

Cover these cases:

```ts
it("loads an approved manifest and five verified slide buffers")
it("rejects a stale revision")
it("rejects a manifest that is not approved")
it("rejects a storage key that escapes the artifact root")
it("rejects a checksum mismatch")
it("rejects a missing slide")
```

Use `mkdtemp`, five 1080×1080 test fixture images, and SHA-256 checksums. Keep test assets generated in the temporary directory, never in source control.

- [ ] **Step 2: Confirm the module does not exist**

Run:

```powershell
pnpm test -- src/server/carousel-artifacts/artifact-store.test.ts
```

Expected: FAIL with a module-resolution error for `artifact-store`.

- [ ] **Step 3: Define the store interface and explicit errors**

Create `artifact-store.ts` with:

```ts
export interface LoadedCarouselSlide {
  asset: CarouselSlideAsset
  bytes: Uint8Array
}

export interface LoadedApprovedCarouselRun {
  run: ApprovedCarouselRun
  slides: LoadedCarouselSlide[]
}

export interface CarouselArtifactStore {
  loadApprovedRun(runId: string, revision: number): Promise<LoadedApprovedCarouselRun>
}

export class ArtifactValidationError extends Error {
  constructor(
    public readonly code:
      | "RUN_NOT_FOUND"
      | "STALE_REVISION"
      | "NOT_APPROVED"
      | "INVALID_MANIFEST"
      | "INVALID_ASSET_PATH"
      | "ASSET_MISSING"
      | "CHECKSUM_MISMATCH",
    message: string,
  ) {
    super(message)
  }
}
```

- [ ] **Step 4: Implement a filesystem-backed store**

Use this layout beneath `CAROUSEL_ARTIFACT_ROOT`:

```text
<root>/<runId>/manifest.json
<root>/<runId>/slides/01.png
<root>/<runId>/slides/02.png
<root>/<runId>/slides/03.png
<root>/<runId>/slides/04.png
<root>/<runId>/slides/05.png
```

Resolve both the run directory and each storage key with `path.resolve`; require the result to begin with the resolved root plus `path.sep`. Parse JSON with `approvedCarouselRunSchema`, compare the requested revision, read each buffer, and calculate `createHash("sha256")`. The schema enforces declared dimensions; Task 4 also verifies the dimensions encoded in the actual image bytes. Return no filesystem paths to callers.

- [ ] **Step 5: Document safe local configuration**

Add this to `.env.example` with no secret values:

```dotenv
CAROUSEL_ARTIFACT_ROOT=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3100/api/linkedin/oauth/callback
LINKEDIN_SESSION_SECRET=
LINKEDIN_API_VERSION=
```

Add `/data/carousel-runs/` to `dashboard/.gitignore` so generated slides, manifests, and PDFs cannot be committed accidentally.

- [ ] **Step 6: Run artifact-store tests**

Run:

```powershell
pnpm test -- src/server/carousel-artifacts/artifact-store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit artifact validation**

```powershell
git add dashboard/src/server/carousel-artifacts dashboard/.gitignore dashboard/.env.example
git commit -m "feat: validate approved carousel artifacts"
```

---

## Task 4: Build a deterministic five-page PDF

**Files:**

- Create: `dashboard/src/server/linkedin/pdf-builder.ts`
- Create: `dashboard/src/server/linkedin/pdf-builder.test.ts`

- [ ] **Step 1: Write failing PDF tests**

Test real PNG and JPEG byte fixtures:

```ts
it("creates a PDF with exactly five square pages in manifest order", async () => {
  const pdf = await buildCarouselPdf(validLoadedRun.slides)
  const parsed = await PDFDocument.load(pdf)
  expect(parsed.getPageCount()).toBe(5)
  expect(parsed.getPages().map((page) => page.getSize())).toEqual(
    Array.from({ length: 5 }, () => ({ width: 1080, height: 1080 })),
  )
})

it("returns identical bytes for identical slide input")
it("rejects fewer or more than five slides")
it("rejects duplicate or unordered indexes")
it("rejects bytes that do not match the declared MIME type")
it("rejects image bytes whose encoded dimensions are not 1080 by 1080")
it("rejects a generated PDF larger than LinkedIn's 100 MB document limit")
```

- [ ] **Step 2: Run the missing-module failure**

Run:

```powershell
pnpm test -- src/server/linkedin/pdf-builder.test.ts
```

Expected: FAIL because `buildCarouselPdf` does not exist.

- [ ] **Step 3: Implement the PDF builder**

Export:

```ts
export async function buildCarouselPdf(
  slides: readonly LoadedCarouselSlide[],
): Promise<Uint8Array>
```

Require indexes `[1, 2, 3, 4, 5]`. Create a new `PDFDocument`, set fixed metadata values rather than wall-clock dates, and embed each source with `embedPng` or `embedJpg`. Reject it unless the embedded image reports `width === 1080` and `height === 1080`; this checks the actual image header rather than trusting the manifest. Add five 1080×1080 pages and draw each image at `{ x: 0, y: 0, width: 1080, height: 1080 }`. Save with fixed options, then reject output greater than `100 * 1024 * 1024` bytes:

```ts
return document.save({
  addDefaultPage: false,
  useObjectStreams: false,
  objectsPerTick: Number.POSITIVE_INFINITY,
})
```

- [ ] **Step 4: Run PDF tests**

Run:

```powershell
pnpm test -- src/server/linkedin/pdf-builder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit PDF assembly**

```powershell
git add dashboard/src/server/linkedin/pdf-builder.ts dashboard/src/server/linkedin/pdf-builder.test.ts
git commit -m "feat: build deterministic carousel PDF"
```

---

## Task 5: Implement secure LinkedIn OAuth and connection status

**Files:**

- Create: `dashboard/src/server/linkedin/config.ts`
- Create: `dashboard/src/server/linkedin/config.test.ts`
- Create: `dashboard/src/server/linkedin/errors.ts`
- Create: `dashboard/src/server/linkedin/credential-store.ts`
- Create: `dashboard/src/server/linkedin/credential-store.test.ts`
- Create: `dashboard/src/server/linkedin/oauth.ts`
- Create: `dashboard/src/server/linkedin/oauth.test.ts`
- Create: `dashboard/src/app/api/linkedin/oauth/start/route.ts`
- Create: `dashboard/src/app/api/linkedin/oauth/callback/route.ts`
- Create: `dashboard/src/app/api/linkedin/connection/route.ts`
- Create: `dashboard/src/app/api/linkedin/routes.test.ts`

- [ ] **Step 1: Write failing configuration and credential tests**

Cover:

```ts
it("rejects missing LinkedIn environment variables")
it("rejects a session secret shorter than 32 bytes")
it("encrypts and decrypts a credential without exposing the access token")
it("rejects a modified encrypted credential")
it("treats an expired credential as disconnected")
```

The credential shape is:

```ts
export interface LinkedInCredential {
  accessToken: string
  expiresAt: number
  subject: string
  authorUrn: `urn:li:person:${string}`
  displayName: string
}
```

- [ ] **Step 2: Write failing OAuth tests**

Cover:

```ts
it("builds an authorization URL with openid profile w_member_social")
it("generates an expiring signed state and verifies it timing-safely")
it("rejects a state issued for a different browser session")
it("exchanges the authorization code using the configured redirect URI")
it("verifies ID-token issuer, audience, signature, and expiration")
it("maps the OIDC subject to a personal author URN")
```

Mock `fetch` and the JWKS response. No test may reach `linkedin.com`.

- [ ] **Step 3: Write failing route tests**

Verify:

```ts
it("GET /oauth/start redirects to LinkedIn and sets an HttpOnly state cookie")
it("GET /oauth/callback rejects a mismatched state")
it("GET /oauth/callback handles LinkedIn denial without exchanging a code")
it("GET /oauth/callback returns a safe failure when code exchange fails")
it("GET /oauth/callback stores the encrypted credential and redirects to the carousel")
it("GET /connection returns only safe connection metadata")
```

The safe response is:

```ts
export interface LinkedInConnectionResponse {
  connected: boolean
  displayName?: string
  expiresAt?: number
  reconnectRequired: boolean
}
```

- [ ] **Step 4: Confirm all OAuth tests fail initially**

Run:

```powershell
pnpm test -- src/server/linkedin/config.test.ts src/server/linkedin/credential-store.test.ts src/server/linkedin/oauth.test.ts src/app/api/linkedin/routes.test.ts
```

Expected: FAIL because the server modules and route handlers do not exist.

- [ ] **Step 5: Implement validated configuration and typed errors**

Parse the five LinkedIn variables with Zod in `config.ts`; require `LINKEDIN_API_VERSION` to match `/^\d{6}$/`. In `errors.ts`, define safe error codes:

```ts
export type LinkedInErrorCode =
  | "AUTH_REQUIRED"
  | "INSUFFICIENT_SCOPE"
  | "STALE_REVISION"
  | "DUPLICATE_PUBLISH"
  | "UNKNOWN_OUTCOME"
  | "INVALID_ARTIFACT"
  | "RATE_LIMITED"
  | "LINKEDIN_UNAVAILABLE"
  | "CONFIGURATION_ERROR"
```

Keep internal response bodies and access tokens out of public error messages.

- [ ] **Step 6: Implement AES-256-GCM cookie credentials**

Derive a 32-byte encryption key with SHA-256 over `LINKEDIN_SESSION_SECRET`. Encode `{ version, iv, tag, ciphertext }` as base64url JSON. Authenticate the cookie name as AES additional authenticated data. Expose a `LinkedInCredentialStore` interface plus a Next-cookie implementation that writes:

```ts
{
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires: new Date(credential.expiresAt),
}
```

- [ ] **Step 7: Implement OAuth state and OIDC verification**

Use `randomBytes(32)` for a nonce and HMAC-SHA-256 for state binding. Compare MACs with `timingSafeEqual`. Use `jose`'s `createRemoteJWKSet` and `jwtVerify` against LinkedIn's OIDC discovery metadata, while requiring the configured client ID as audience. Exchange the code only after state verification. Build `authorUrn` from the verified `sub` claim.

- [ ] **Step 8: Implement thin App Router handlers**

- `/oauth/start`: bind state to a short-lived browser nonce cookie, then redirect to authorization.
- `/oauth/callback`: validate denial/error parameters and state first; exchange only a valid `code`, verify the ID token, store encrypted credentials, clear state cookies, then redirect to `/dashboard?workflow=carousel&linkedin=connected`. Denial and exchange failures redirect with a stable safe status code, never the provider's description.
- `/connection`: read/decrypt the credential and return only `connected`, `displayName`, `expiresAt`, and `reconnectRequired` with `Cache-Control: no-store`.

- [ ] **Step 9: Run OAuth and route tests**

Run:

```powershell
pnpm test -- src/server/linkedin/config.test.ts src/server/linkedin/credential-store.test.ts src/server/linkedin/oauth.test.ts src/app/api/linkedin/routes.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit OAuth**

```powershell
git add dashboard/src/server/linkedin dashboard/src/app/api/linkedin dashboard/.env.example
git commit -m "feat: add secure LinkedIn OAuth connection"
```

---

## Task 6: Add the direct LinkedIn Documents and Posts adapter

**Files:**

- Create: `dashboard/src/server/linkedin/linkedin-client.ts`
- Create: `dashboard/src/server/linkedin/linkedin-client.test.ts`

- [ ] **Step 1: Write mocked HTTP-contract tests**

Cover:

```ts
it("initializes a document upload for the personal author using only the supported owner field")
it("uploads PDF bytes to the returned upload URL")
it("creates a public document post with commentary and title")
it("sends Authorization, LinkedIn-Version, and X-Restli-Protocol-Version on REST calls")
it("sends Authorization and application/pdf on the signed upload request")
it("maps 401 to AUTH_REQUIRED")
it("maps 403 to INSUFFICIENT_SCOPE")
it("maps 429 and Retry-After to RATE_LIMITED")
it("maps LinkedIn 5xx to LINKEDIN_UNAVAILABLE")
it("marks a network failure during post creation as UNKNOWN_OUTCOME")
```

Assert the initialize body:

```ts
{
  initializeUploadRequest: {
    owner: "urn:li:person:member-123",
  },
}
```

Assert the post body contains:

```ts
{
  author: "urn:li:person:member-123",
  commentary,
  visibility: "PUBLIC",
  distribution: {
    feedDistribution: "MAIN_FEED",
    targetEntities: [],
    thirdPartyDistributionChannels: [],
  },
  content: {
    media: {
      id: documentUrn,
      title: documentTitle,
    },
  },
  lifecycleState: "PUBLISHED",
  isReshareDisabledByAuthor: false,
}
```

- [ ] **Step 2: Confirm the adapter is absent**

Run:

```powershell
pnpm test -- src/server/linkedin/linkedin-client.test.ts
```

Expected: FAIL with a module-resolution error.

- [ ] **Step 3: Define a fetch-injected client**

Export:

```ts
export interface LinkedInClientOptions {
  accessToken: string
  apiVersion: string
  fetch: typeof globalThis.fetch
}

export class LinkedInClient {
  initializeDocumentUpload(input: InitializeDocumentInput): Promise<InitializedDocument>
  uploadDocument(uploadUrl: string, pdf: Uint8Array): Promise<void>
  createDocumentPost(input: CreateDocumentPostInput): Promise<{ postUrn: string }>
}
```

Use `https://api.linkedin.com/rest/documents?action=initializeUpload`, the returned upload URL, and `https://api.linkedin.com/rest/posts`. Read the successful post URN from the `x-restli-id` response header. Initialization and Posts REST calls use:

```ts
{
  Authorization: `Bearer ${accessToken}`,
  "LinkedIn-Version": apiVersion,
  "X-Restli-Protocol-Version": "2.0.0",
}
```

The signed upload request sends the raw PDF body with `Authorization: Bearer ...` and `Content-Type: application/pdf`; it does not attach JSON-only headers.

Validate every LinkedIn JSON response with Zod before reading its fields. Never log response bodies or authorization headers.

- [ ] **Step 4: Implement classified failures**

Map stable HTTP failures to the codes above. For `createDocumentPost`, distinguish a received non-2xx response from a thrown network/timeout error: the latter is `UNKNOWN_OUTCOME` because LinkedIn may have accepted the post before the connection failed.

- [ ] **Step 5: Run adapter tests**

Run:

```powershell
pnpm test -- src/server/linkedin/linkedin-client.test.ts
```

Expected: PASS with every request satisfied by the mock fetch.

- [ ] **Step 6: Commit the direct adapter**

```powershell
git add dashboard/src/server/linkedin/linkedin-client.ts dashboard/src/server/linkedin/linkedin-client.test.ts
git commit -m "feat: add LinkedIn document publishing adapter"
```

---

## Task 7: Orchestrate publishing with persistent idempotency

**Files:**

- Create: `dashboard/src/server/linkedin/publish-attempt-store.ts`
- Create: `dashboard/src/server/linkedin/publish-attempt-store.test.ts`
- Create: `dashboard/src/server/linkedin/publisher.ts`
- Create: `dashboard/src/server/linkedin/publisher.test.ts`
- Create: `dashboard/src/app/api/linkedin/publish/route.ts`
- Create: `dashboard/src/app/api/linkedin/publish/route.test.ts`

- [ ] **Step 1: Write idempotency-store tests**

Use this state model:

```ts
export type PublishAttemptState =
  | "started"
  | "document_uploaded"
  | "published"
  | "failed_safe"
  | "unknown"
```

Test that `(runId, revision, idempotencyKey)` is unique, state transitions are atomic, published results can be replayed safely, and `unknown` attempts cannot be restarted automatically.

- [ ] **Step 2: Write publisher orchestration tests**

With fake stores, fake PDF builder, and fake client, cover:

```ts
it("loads the approved revision, builds the PDF, uploads it, and creates one post")
it("returns the saved result without a network call for the same published key")
it("rejects the same run and revision with a different completed key")
it("rejects a concurrent in-progress attempt")
it("rejects a stale revision before PDF or LinkedIn calls")
it("records document_uploaded and the PDF checksum before creating the post")
it("records unknown when post creation has an ambiguous network failure")
it("allows a retry after failed_safe without duplicating a published result")
```

- [ ] **Step 3: Write publish-route tests**

Verify the exact status mapping:

```text
401  AUTH_REQUIRED
403  INSUFFICIENT_SCOPE
409  STALE_REVISION, DUPLICATE_PUBLISH, or UNKNOWN_OUTCOME
422  INVALID_ARTIFACT
429  RATE_LIMITED
502  invalid upstream response
503  LINKEDIN_UNAVAILABLE or CONFIGURATION_ERROR
```

Also assert malformed input is rejected, no cookie token appears in JSON, and a successful response contains only the post URN, canonical post URL, and publish timestamp.

- [ ] **Step 4: Run the initial failing tests**

Run:

```powershell
pnpm test -- src/server/linkedin/publish-attempt-store.test.ts src/server/linkedin/publisher.test.ts src/app/api/linkedin/publish/route.test.ts
```

Expected: FAIL because the store, orchestrator, and route do not exist.

- [ ] **Step 5: Implement the attempt store**

Define:

```ts
export interface PublishAttemptStore {
  begin(input: PublishAttemptIdentity): Promise<BeginAttemptResult>
  transition(
    identity: PublishAttemptIdentity,
    expected: PublishAttemptState,
    next: PublishAttemptRecord,
  ): Promise<void>
  get(identity: PublishAttemptIdentity): Promise<PublishAttemptRecord | null>
}
```

Implement a filesystem store under `<CAROUSEL_ARTIFACT_ROOT>/.publish-attempts/`. `begin` uses `open(path, "wx")` so two concurrent confirmations cannot both create the attempt. Each transition acquires a per-attempt lock with `open(lockPath, "wx")`, rereads and verifies the expected state, writes a unique temporary sibling, atomically renames it over the record, and releases the lock in `finally`. Key filenames with SHA-256 over the identity rather than raw user input. The `document_uploaded` record includes the document URN and SHA-256 PDF checksum; the `published` record adds the post URN, safe post URL, and timestamp. Store no access tokens or PDF bytes.

- [ ] **Step 6: Implement the publisher service**

Define the adapter boundary from the design:

```ts
export interface LinkedInPublisher {
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

The service sequence is fixed:

1. Begin or safely replay the idempotency attempt.
2. Load the exact approved run revision.
3. Build the five-page PDF.
4. Initialize and upload the document.
5. Persist `document_uploaded`, its document URN, and the PDF SHA-256 checksum.
6. Create the public post.
7. Persist `published` and return the safe result.

If post creation is ambiguous, persist `unknown` and return 409. Do not automatically call Posts again for an `unknown` attempt.

- [ ] **Step 7: Implement the POST route as composition root**

Validate the body with:

```ts
const publishRequestSchema = z.object({
  runId: z.string().min(1).max(128),
  revision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
})
```

Read the encrypted credential, compose the artifact store, attempt store, PDF builder, and LinkedIn client, invoke the service, then return `Cache-Control: no-store`. This route is the only client-accessible path that can publish.

- [ ] **Step 8: Run orchestration and route tests**

Run:

```powershell
pnpm test -- src/server/linkedin/publish-attempt-store.test.ts src/server/linkedin/publisher.test.ts src/app/api/linkedin/publish/route.test.ts
```

Expected: PASS without external network access.

- [ ] **Step 9: Commit the publish boundary**

```powershell
git add dashboard/src/server/linkedin dashboard/src/app/api/linkedin/publish
git commit -m "feat: publish approved carousel idempotently"
```

---

## Task 8: Build the Publisher panel and confirmation UX

**Files:**

- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-client.ts`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-client.test.ts`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-node.tsx`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-panel.tsx`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publisher-panel.test.tsx`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publish-dialog.tsx`
- Create: `dashboard/src/features/carousel/publisher/linkedin-publish-dialog.test.tsx`

- [ ] **Step 1: Write API-client tests**

Test `getLinkedInConnection()` and `publishCarousel(request)` with injected fetch. Require `credentials: "same-origin"`, safe JSON parsing, and typed errors for every route status from Task 7.

- [ ] **Step 2: Write panel-state tests**

Cover the complete user-visible state matrix:

```ts
it("shows Connect LinkedIn while disconnected")
it("shows Reconnect LinkedIn when the credential expired")
it("shows a locked reason when no approved real artifact exists")
it("enables Publish only when connected and artifactReady is true")
it("does not call publish before the confirmation button is clicked")
it("disables all actions while publishing")
it("shows the LinkedIn post link after success")
it("requires manual recovery for UNKNOWN_OUTCOME")
```

Use props:

```ts
export interface LinkedInPublisherPanelProps {
  runId: string | null
  revision: number | null
  artifactReady: boolean
  onStateChange(state: LinkedInPublisherState): void
}
```

- [ ] **Step 3: Write confirmation-dialog tests**

The dialog must show the connected profile name, document title, five-page count, public visibility, and a clear statement that clicking confirms a real LinkedIn post. Test Cancel, final Publish, Escape, and double-click protection.

- [ ] **Step 4: Run failing component tests**

Run:

```powershell
pnpm test -- src/features/carousel/publisher
```

Expected: FAIL because the client and components do not exist.

- [ ] **Step 5: Implement the client and stateful panel**

`Connect LinkedIn` and `Reconnect LinkedIn` use:

```ts
window.location.assign("/api/linkedin/oauth/start")
```

The Publish button opens the dialog; only the dialog's final action generates `crypto.randomUUID()` and posts `{ runId, revision, idempotencyKey }`. Preserve the same key across a safe transport retry during the mounted request. Map progress to `preparing_pdf` initially, then to `published` or `failed`; do not invent progress percentages the server cannot prove.

- [ ] **Step 6: Implement focused manual-node content**

`linkedin-publisher-node.tsx` renders the status summary used in the inspector/panel: connection name, `5-page PDF`, `Public`, approved revision, and last publish link. It must never accept an access token prop.

- [ ] **Step 7: Run publisher UI tests**

Run:

```powershell
pnpm test -- src/features/carousel/publisher
```

Expected: PASS.

- [ ] **Step 8: Commit the Publisher UI**

```powershell
git add dashboard/src/features/carousel/publisher
git commit -m "feat: add approval-gated LinkedIn publisher UI"
```

---

## Task 9: Integrate the Publisher into the carousel workspace

**Files:**

- Modify: `dashboard/src/features/automation/automation-dashboard.tsx`
- Modify: `dashboard/src/features/automation/automation-dashboard.test.tsx`
- Modify: `dashboard/src/features/automation/workflow-canvas.tsx`
- Modify: `dashboard/src/features/automation/workflow-connections.tsx`
- Modify: `dashboard/src/features/carousel/carousel-output-gallery.test.tsx`

- [ ] **Step 1: Add failing integration tests**

Extend `automation-dashboard.test.tsx`:

```ts
it("renders LinkedIn Publisher only in the carousel workflow")
it("keeps the Publisher idle after Run Workflow completes")
it("never calls /api/linkedin/publish from Run Workflow")
it("opens the publisher panel when the Publisher node is selected")
it("keeps Publish locked for CSS-only fixture slides")
it("renders Newsletter without a Publisher node or LinkedIn panel")
```

Update the gallery assertion from eight to five individually openable slide previews.

- [ ] **Step 2: Run integration tests and capture the failures**

Run:

```powershell
pnpm test -- src/features/automation/automation-dashboard.test.tsx src/features/carousel/carousel-output-gallery.test.tsx
```

Expected: FAIL because the Publisher panel is not mounted and gallery expectations still describe eight slides.

- [ ] **Step 3: Integrate without creating a fake publishable run**

In `AutomationWorkspace`, keep explicit artifact state:

```ts
const approvedArtifact = null satisfies null | {
  runId: string
  revision: number
}
```

Pass `artifactReady={approvedArtifact !== null}`. This intentionally keeps Publish locked while the upstream workflow still produces CSS fixtures. Structure the prop boundary so a later real ImageGen/artifact task can supply the server-issued run ID and revision without changing the Publisher API.

- [ ] **Step 4: Synchronize canvas and panel state**

Hold `LinkedInPublisherState` in the carousel workspace, map it with `toCanvasExecutionStatus`, and override only `statuses.publisher`. Publisher state changes must not alter simulation state or activate the `review-publisher` connection. Selecting the node displays the Publisher details and actions; the Visual Production section and five-image review gallery remain intact.

- [ ] **Step 5: Verify workflow isolation**

Run:

```powershell
pnpm test -- src/features/automation src/features/carousel
```

Expected: PASS. The Newsletter fixture, sidebar navigation, and workspace tests remain unchanged except for shared type compatibility.

- [ ] **Step 6: Commit dashboard integration**

```powershell
git add dashboard/src/features/automation dashboard/src/features/carousel
git commit -m "feat: integrate LinkedIn publisher workspace"
```

---

## Task 10: Verify security, behavior, and production readiness

**Files:**

- Modify if a verified gap is found: files changed in Tasks 1–9
- Modify: `dashboard/README.md`

- [ ] **Step 1: Document operator setup and the no-live-test rule**

Add a `LinkedIn Publisher` section to `dashboard/README.md` that explains:

- required environment variables and LinkedIn redirect URI;
- exact OAuth scopes;
- approved artifact directory layout;
- the distinction between preview fixtures and publishable artifacts;
- manual confirmation and public visibility;
- how `unknown` outcomes are reconciled manually before retrying;
- that automated tests mock LinkedIn and never publish.

- [ ] **Step 2: Run the complete automated suite**

Run:

```powershell
pnpm test
```

Expected: all tests PASS and no request reaches a LinkedIn host.

- [ ] **Step 3: Run static checks and production build**

Run:

```powershell
pnpm lint
pnpm build
```

Expected: both commands exit 0 with no TypeScript, ESLint, or App Router errors.

- [ ] **Step 4: Audit secrets and forbidden client imports**

Run:

```powershell
rg -n "LINKEDIN_CLIENT_SECRET|LINKEDIN_SESSION_SECRET|accessToken" src/features src/app --glob "*.ts" --glob "*.tsx"
rg -n "@/server/linkedin|@/server/carousel-artifacts" src/features --glob "*.ts" --glob "*.tsx"
```

Expected: secret names appear only in server configuration/documentation; no client component imports a server module; `accessToken` appears only in server code and test fixtures.

- [ ] **Step 5: Audit the manual-only boundary**

Run:

```powershell
rg -n "api/linkedin/publish|publishCarousel" src/features/automation src/features/carousel
```

Expected: the publish call exists only in `linkedin-publisher-client.ts` and the confirmation-driven panel path, never in `use-workflow-simulation.ts` or the `Run Workflow` handler.

- [ ] **Step 6: Perform local UI verification without OAuth or publishing**

Run:

```powershell
pnpm dev -- --port 3100
```

At `http://localhost:3100/dashboard?workflow=carousel`, verify:

1. The six-node canvas has authentic ports and five visible connections.
2. `Run Workflow` stops at Review Carousel and Publisher remains manual.
3. Selecting Publisher shows Connect LinkedIn and the real-artifact lock.
4. Visual Production and all five individually openable image previews remain visible.
5. The layout is usable at 1440×900 and 390×844.
6. Switching to Newsletter shows no LinkedIn Publisher node or panel.

Do not connect a LinkedIn account and do not click any live publish confirmation during this verification.

- [ ] **Step 7: Review the final diff against the approved design**

Run:

```powershell
git diff 43e79fb...HEAD --stat
git diff 43e79fb...HEAD -- dashboard/src dashboard/README.md dashboard/.env.example
git status --short
```

Expected: only the LinkedIn carousel Publisher work and shared backward-compatible workflow changes are present; no Newsletter implementation files or credentials are included; the worktree is clean after the final commit.

- [ ] **Step 8: Commit documentation and verified corrections**

```powershell
git add dashboard/README.md dashboard/src dashboard/.env.example dashboard/.gitignore dashboard/package.json dashboard/pnpm-lock.yaml
git commit -m "docs: document LinkedIn publisher operations"
```

If all implementation files were already committed and only README changed, stage and commit only `dashboard/README.md`.

---

## LinkedIn API Sources Verified for This Plan

- [LinkedIn 3-legged authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Sign In with LinkedIn using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [LinkedIn Documents API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api)
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [LinkedIn Post schema](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema)

The implementation must keep `LINKEDIN_API_VERSION` configurable because LinkedIn sunsets dated Marketing API versions. The request shapes in Task 6 intentionally use the current Documents API `initializeUploadRequest.owner` contract and the Posts API document-media contract.

---

## Definition of Done

- The carousel canvas contains a sixth, visibly manual LinkedIn Publisher node and a Review-to-Publisher connection.
- `Run Workflow` completes the five automatic nodes and cannot initiate LinkedIn traffic.
- The carousel preview contains exactly five individually reviewable images.
- Publish remains locked until a real server-side approved manifest for the current revision exists.
- OAuth connects a personal LinkedIn account with only `openid profile w_member_social` and stores encrypted server-only credentials.
- The server validates five artifacts, produces a deterministic five-page 1080×1080 PDF, uploads it through LinkedIn Documents, and creates one public document post through Posts.
- The final confirmation is the only trigger for publishing.
- Duplicate, stale, expired-auth, insufficient-scope, rate-limit, upstream, and ambiguous-outcome paths are tested and safely classified.
- All unit/integration tests, lint, and production build pass without live LinkedIn calls.
- Newsletter behavior and files remain isolated.
