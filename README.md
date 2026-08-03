# LinkedIn Newsletter Content Automation

Next.js dashboard for LinkedIn carousel and newsletter content automation.

## What's included

- **Content Pipeline** (`/dashboard?view=pipeline`) — five-stage board (Research → Ready) with typed fixture data and filters
- **LinkedIn Carousel Automation** — simulated workflow canvas with LinkedIn publisher
- **Newsletter** — simulated newsletter production workspace

## Run locally

```bash
cd dashboard
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
cd dashboard
pnpm test
pnpm lint
pnpm build
```

Optional LinkedIn publisher env vars are documented in `dashboard/.env.example`.
