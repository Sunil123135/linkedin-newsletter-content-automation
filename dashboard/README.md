This is the dashboard for the LinkedIn carousel and newsletter automation workspaces. The LinkedIn Publisher is isolated to the carousel workflow and is always a manual approval boundary.

## Getting Started

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/dashboard?workflow=carousel](http://localhost:3000/dashboard?workflow=carousel) to see the carousel workspace. For the documented local OAuth callback on port 3100, run `pnpm dev -- --port 3100` instead.

## LinkedIn Publisher

The Publisher converts one approved five-slide run into a deterministic five-page PDF and sends it to the connected member's personal LinkedIn profile. `Run Workflow` stops after Review Carousel. It cannot publish; only the final confirmation inside the Publisher dialog calls the publish route, and every post is created with `PUBLIC` visibility.

### Environment and LinkedIn application setup

Copy `.env.example` to `.env.local` and configure:

- `CAROUSEL_ARTIFACT_ROOT`: absolute path to the approved-run and publish-attempt store described below.
- `LINKEDIN_CLIENT_ID`: LinkedIn application client ID.
- `LINKEDIN_CLIENT_SECRET`: LinkedIn application client secret; server-only.
- `LINKEDIN_REDIRECT_URI`: exact registered callback URI. Local development on the documented port uses `http://localhost:3100/api/linkedin/oauth/callback`.
- `LINKEDIN_SESSION_SECRET`: server-only session encryption secret of at least 32 UTF-8 bytes.
- `LINKEDIN_API_VERSION`: supported LinkedIn Marketing API version in `YYYYMM` format. Review this value as LinkedIn retires dated API versions.

Register the redirect URI exactly in the LinkedIn developer application. Enable Sign In with LinkedIn using OpenID Connect and Share on LinkedIn. The OAuth request uses exactly `openid profile w_member_social`; it does not request email or organization-page access. A successful existing authorization may be reused by LinkedIn, but the application does not assume refresh tokens. Reconnect through the dashboard when the credential expires or is rejected.

### Approved artifacts

The filesystem store expects this layout:

```text
<CAROUSEL_ARTIFACT_ROOT>/
  <runId>/
    manifest.json
    slides/
      01.png
      02.png
      03.png
      04.png
      05.png
  .publish-attempts/
    .initialized
    <sha256-identity>.json
```

`manifest.json` must identify the requested run and revision, have `status: "approved"`, contain a caption and document title, and list exactly five ordered 1080×1080 PNG/JPEG slides. Each storage key must remain inside its run directory and each file must match its SHA-256 checksum. The server verifies the real image bytes and produces the PDF; browser-supplied paths, files, captions, visibility, and credentials are not accepted at publish time.

The carousel images currently visible in the dashboard are CSS preview fixtures. They are review UI, not real PNG/JPEG artifacts, so they intentionally keep Publish locked. A publishable run exists only when the upstream image workflow writes the approved server-side manifest and five real slide files, then supplies that run ID and revision to the workspace.

### Storage and deployment constraints

The current artifact and idempotency stores require one shared, persistent local Linux filesystem with reliable exclusive-create, file-lock, directory-sync, and atomic-rename semantics. Keep `CAROUSEL_ARTIFACT_ROOT` outside the source tree on that filesystem. OneDrive, SMB/NFS/network shares, per-instance ephemeral disks, and separate local disks in a multi-instance deployment are unsupported because they can break locking or allow duplicate publishers. For horizontal or serverless deployment, replace the filesystem attempt store with one transactional shared database before enabling publishing.

The PDF builder depends on the native `sharp` package. The deployment image must install its production dependency and provide a compatible native binary for the target Linux architecture; verify PDF tests and `pnpm build` inside the same image used in production.

Filesystem failures intentionally fail closed, but a process crash can leave a `.lock`, `.scope.lock`, `.init.lock`, or temporary file. If publishing reports a persistent lock, stop all application instances, preserve a backup of the artifact root, identify the affected run/revision from its attempt records and application-safe error context, and reconcile LinkedIn before removing only the confirmed stale lock or temporary file. Never delete a published or `unknown` JSON attempt record to force a retry.

### Ambiguous outcomes and operator reconciliation

If the Posts API request may have reached LinkedIn but its response cannot be proven, the attempt is stored as `unknown`. Automatic retry is blocked to avoid a duplicate public post. An operator must inspect the connected member's LinkedIn activity for the matching carousel and caption, preserve the attempt record, and reconcile the outcome in operational records. If the post exists, treat it as published and do not retry. If absence can be established, use an explicit, audited manual recovery procedure; this version intentionally provides no button that blindly retries an `unknown` result.

### Test safety

Automated tests inject mock fetch clients and mock every LinkedIn OAuth, JWKS, document upload, and Posts response. They must never contact a LinkedIn host or create a post. Local UI verification must not click Connect LinkedIn or the final publish confirmation. Run the suite serially on Windows for stable results:

```bash
pnpm test -- --fileParallelism=false
pnpm lint
pnpm build
```
