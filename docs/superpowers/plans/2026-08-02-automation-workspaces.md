# LinkedIn Automation Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two polished, UI-only automation workspaces with an n8n-inspired workflow canvas, simulated execution, production summaries, and reviewable carousel/newsletter outputs inside the installed shadcn dashboard shell.

**Architecture:** The Next.js server page resolves `?workflow=carousel|newsletter` and passes the selected fixture set into a shared client-side `AutomationDashboard`. Shared canvas components render typed fixed-position nodes and SVG connections, while a dedicated hook owns reset-safe simulated execution. Workflow-specific production and output components remain isolated behind the shared workspace shell.

**Tech Stack:** Next.js 16.2.12, React 19.2.4, TypeScript 5.9.3, Tailwind CSS 4.3.3, shadcn/ui `dashboard-01`, TweakCN semantic theme tokens, Lucide icons, Vitest, Testing Library.

## Global Constraints

- Frontend only: do not call Firecrawl, OpenAI, image providers, LinkedIn, newsletter APIs, or persistence services.
- Preserve the installed `dashboard-01` sidebar, header, inset layout, responsiveness, and shadcn conventions.
- Apply the exact user-supplied TweakCN tokens from the trusted local MIT reference repository because the registry URL is blocked by the corporate TLS chain.
- Sidebar primary destinations must be exactly `LinkedIn Carousel Automation` and `Newsletter`.
- `Run Workflow` must be the primary top-header action.
- Do not render descriptive hero copy, `Front-end Prototype`, command center, workflow-health, analytics, scheduling, or publishing controls.
- Nodes are selectable and the canvas is zoomable; nodes are not draggable and connections are not editable.
- Carousel review contains exactly eight fixture slides, all individually openable.
- Dark mode is active by default.
- Use semantic theme tokens instead of hardcoded UI colors.
- Retain the MIT copyright and license notice for adapted reference material.

---

## Planned file structure

### Foundation and shell

- `dashboard/src/app/globals.css`: exact TweakCN theme tokens.
- `dashboard/src/app/layout.tsx`: Inter, Playfair Display, JetBrains Mono, dark mode, tooltip and toaster providers.
- `dashboard/src/app/page.tsx`: redirects `/` to `/dashboard?workflow=carousel`.
- `dashboard/src/app/dashboard/page.tsx`: resolves asynchronous Next.js 16 `searchParams` and composes `dashboard-01`.
- `dashboard/src/components/app-sidebar.tsx`: two exact workflow links.
- `dashboard/src/components/site-header.tsx`: active title and controlled Run Workflow button.
- `dashboard/THIRD_PARTY_NOTICES.md`: reference attribution.

### Workflow feature

- `dashboard/src/features/automation/types.ts`: domain contracts.
- `dashboard/src/features/automation/workflow-fixtures.ts`: carousel and newsletter nodes, connections, slides, and article content.
- `dashboard/src/features/automation/use-workflow-simulation.ts`: sequential UI execution.
- `dashboard/src/features/automation/automation-dashboard.tsx`: shared client composition.
- `dashboard/src/features/automation/workflow-canvas.tsx`: canvas and zoom state.
- `dashboard/src/features/automation/workflow-node.tsx`: accessible node and ports.
- `dashboard/src/features/automation/workflow-connections.tsx`: directional SVG paths.
- `dashboard/src/features/automation/node-inspector.tsx`: selected node detail.
- `dashboard/src/features/automation/carousel-visual-production.tsx`: LinkedIn production state.
- `dashboard/src/features/automation/carousel-output-gallery.tsx`: eight-slide gallery.
- `dashboard/src/features/automation/carousel-slide-dialog.tsx`: individual slide review.
- `dashboard/src/features/automation/newsletter-production.tsx`: editorial and lead-image state.
- `dashboard/src/features/automation/newsletter-output-preview.tsx`: bounded article preview.

### Tests

- `dashboard/vitest.config.ts`: jsdom and alias configuration.
- `dashboard/src/test/setup.ts`: Testing Library matchers.
- `dashboard/src/features/automation/workflow-fixtures.test.ts`: fixture invariants.
- `dashboard/src/features/automation/use-workflow-simulation.test.tsx`: timer-safe execution sequence.
- `dashboard/src/features/automation/workflow-canvas.test.tsx`: selection, inspector, and zoom behavior.
- `dashboard/src/features/automation/carousel-output-gallery.test.tsx`: all eight slide dialogs and navigation.
- `dashboard/src/features/automation/automation-dashboard.test.tsx`: carousel/newsletter composition and forbidden UI.

### Task 1: Finish the themed dashboard foundation

**Files:**
- Modify: `dashboard/src/app/globals.css`
- Modify: `dashboard/src/app/layout.tsx`
- Modify: `dashboard/package.json`
- Create: `dashboard/THIRD_PARTY_NOTICES.md`
- Create: `dashboard/vitest.config.ts`
- Create: `dashboard/src/test/setup.ts`

**Interfaces:**
- Consumes: installed `dashboard-01` and the exact tokens in `.reference/linkedin-agency-automation/dashboard/app/globals.css`.
- Produces: theme variables, dark-mode root layout, shadcn Dialog/Progress primitives, and `pnpm test`.

- [ ] **Step 1: Install the UI and test dependencies**

Run from `dashboard/`:

```powershell
pnpm dlx shadcn@latest add dialog progress -y
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react
pnpm pkg set scripts.test="vitest run"
```

Expected: `src/components/ui/dialog.tsx`, `src/components/ui/progress.tsx`, and a `test` script exist.

- [ ] **Step 2: Apply the exact local TweakCN theme**

Replace `dashboard/src/app/globals.css` with the complete contents of `.reference/linkedin-agency-automation/dashboard/app/globals.css`. Verify the copied file contains these exact distinguishing values:

```css
:root {
  --background: oklch(0.9195 0.0169 88.0030);
  --primary: oklch(0.3012 0 0);
  --sidebar: oklch(0.8985 0.0199 87.5195);
}

.dark {
  --background: oklch(0.1913 0 0);
  --primary: oklch(0.8520 0.0205 100.6306);
  --sidebar: oklch(0.1730 0 0);
}
```

Do not alter any other copied theme value.

- [ ] **Step 3: Update the root layout**

Replace `dashboard/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] })
const jetBrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "LinkedIn Automation Studio",
  description: "UI-only carousel and newsletter automation workspaces.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${jetBrainsMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Configure Vitest**

Create `dashboard/vitest.config.ts`:

```ts
import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] },
})
```

Create `dashboard/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

- [ ] **Step 5: Add attribution**

Create `dashboard/THIRD_PARTY_NOTICES.md`:

```md
# Third-Party Notices

Portions of the workflow-dashboard structure and the locally recovered theme configuration were adapted from `harshith-vaddiparthy/linkedin-agency-automation`.

Copyright (c) 2026 Harshith Vaddiparthy

Licensed under the MIT License. The full license is available at https://github.com/harshith-vaddiparthy/linkedin-agency-automation/blob/main/LICENSE.
```

- [ ] **Step 6: Verify and commit the foundation**

Run:

```powershell
pnpm lint
pnpm build
git add dashboard
git commit -m "feat: install themed dashboard foundation"
```

Expected: lint/build exit 0 and the installed block plus exact theme are committed.

### Task 2: Define typed workflow fixtures

**Files:**
- Create: `dashboard/src/features/automation/types.ts`
- Create: `dashboard/src/features/automation/workflow-fixtures.ts`
- Test: `dashboard/src/features/automation/workflow-fixtures.test.ts`

**Interfaces:**
- Produces: `WorkflowKind`, `NodeId`, `ExecutionStatus`, `WorkflowNodeDefinition`, `WorkflowConnection`, `WorkflowDefinition`, `CarouselSlide`, `NewsletterArticle`, `CAROUSEL_WORKFLOW`, `NEWSLETTER_WORKFLOW`, `CAROUSEL_SLIDES`, and `NEWSLETTER_ARTICLE`.

- [ ] **Step 1: Write the failing fixture tests**

Create `workflow-fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  CAROUSEL_SLIDES,
  CAROUSEL_WORKFLOW,
  NEWSLETTER_ARTICLE,
  NEWSLETTER_WORKFLOW,
} from "./workflow-fixtures"

describe("automation fixtures", () => {
  it.each([CAROUSEL_WORKFLOW, NEWSLETTER_WORKFLOW])(
    "$kind has five connected nodes",
    (workflow) => {
      expect(workflow.nodes).toHaveLength(5)
      expect(workflow.connections).toHaveLength(4)
      expect(workflow.connections[0].from).toBe(workflow.nodes[0].id)
      expect(workflow.connections.at(-1)?.to).toBe(workflow.nodes.at(-1)?.id)
    }
  )

  it("contains eight individually identifiable carousel slides", () => {
    expect(CAROUSEL_SLIDES).toHaveLength(8)
    expect(new Set(CAROUSEL_SLIDES.map((slide) => slide.id)).size).toBe(8)
  })

  it("contains publication-shaped newsletter content", () => {
    expect(NEWSLETTER_ARTICLE.sections.length).toBeGreaterThanOrEqual(3)
    expect(NEWSLETTER_ARTICLE.citationCount).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the tests and verify failure**

```powershell
pnpm test -- src/features/automation/workflow-fixtures.test.ts
```

Expected: FAIL because `workflow-fixtures.ts` does not exist.

- [ ] **Step 3: Implement the types**

Create `types.ts`:

```ts
export type WorkflowKind = "carousel" | "newsletter"
export type NodeId = "source" | "research" | "writer" | "visual" | "review"
export type ExecutionStatus = "idle" | "queued" | "running" | "completed" | "error"

export interface WorkflowNodeDefinition {
  id: NodeId
  label: string
  provider: string
  description: string
  input: string
  output: string
  result: string
  position: { x: number; y: number }
  icon: "search" | "brain" | "write" | "image" | "review"
}

export interface WorkflowConnection {
  id: string
  from: NodeId
  to: NodeId
  path: string
}

export interface WorkflowDefinition {
  kind: WorkflowKind
  title: string
  nodes: WorkflowNodeDefinition[]
  connections: WorkflowConnection[]
}

export interface CarouselSlide {
  id: string
  index: number
  eyebrow: string
  title: string
  body: string
  footer: string
}

export interface NewsletterArticle {
  title: string
  deck: string
  readingTime: string
  wordCount: number
  citationCount: number
  sections: { heading: string; body: string }[]
}
```

- [ ] **Step 4: Implement exact fixture content**

Create `workflow-fixtures.ts` with five nodes per workflow in this order:

```ts
const ORDERED_IDS: NodeId[] = ["source", "research", "writer", "visual", "review"]
const CONNECTION_PATHS = [
  "M220 135 C270 135 280 135 330 135",
  "M500 135 C550 135 560 135 610 135",
  "M780 135 C830 135 840 135 890 135",
  "M1000 180 C1000 270 720 270 720 340",
]
```

Carousel labels/providers must be `Find Current News / Firecrawl`, `Synthesize Research / OpenAI`, `Write Carousel Copy / OpenAI`, `Visual Production / OpenAI Image · Nano Banana`, and `Review Carousel / Dashboard`.

Newsletter labels/providers must be `Collect Sources / Firecrawl`, `Build Editorial Brief / OpenAI`, `Write Newsletter / OpenAI`, `Create Lead Visual / OpenAI Image · Nano Banana`, and `Review Newsletter / Dashboard`.

Positions must be `{x: 4,y: 10}`, `{x: 27,y: 10}`, `{x: 50,y: 10}`, `{x: 73,y: 10}`, and `{x: 50,y: 66}`. Connections join adjacent IDs and use the four paths above.

Create eight carousel slide objects numbered 1–8 with distinct IDs `slide-1` through `slide-8`, titles covering agent demos, failure recovery, validation, observability, human review, and workflow design. Create a newsletter article titled `The systems behind dependable AI agents` with a deck, `7 min read`, `1420` words, `9` citations, and at least three complete fixture sections.

- [ ] **Step 5: Verify and commit fixtures**

```powershell
pnpm test -- src/features/automation/workflow-fixtures.test.ts
git add dashboard/src/features/automation
git commit -m "test: define automation workflow fixtures"
```

Expected: all fixture tests pass.

### Task 3: Implement reset-safe workflow simulation

**Files:**
- Create: `dashboard/src/features/automation/use-workflow-simulation.ts`
- Test: `dashboard/src/features/automation/use-workflow-simulation.test.tsx`

**Interfaces:**
- Consumes: ordered `WorkflowNodeDefinition[]` and `WorkflowConnection[]`.
- Produces: `useWorkflowSimulation(nodes, connections)` returning `{statuses, activeConnectionId, isRunning, run}`.

- [ ] **Step 1: Write the failing hook test**

```tsx
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CAROUSEL_WORKFLOW } from "./workflow-fixtures"
import { RUN_STEP_MS, useWorkflowSimulation } from "./use-workflow-simulation"

afterEach(() => vi.useRealTimers())

describe("useWorkflowSimulation", () => {
  it("runs nodes in order and completes cleanly", async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useWorkflowSimulation(CAROUSEL_WORKFLOW.nodes, CAROUSEL_WORKFLOW.connections)
    )

    act(() => void result.current.run())
    expect(result.current.statuses.source).toBe("running")

    await act(async () => vi.advanceTimersByTimeAsync(RUN_STEP_MS * 5))
    expect(Object.values(result.current.statuses).every((status) => status === "completed")).toBe(true)
    expect(result.current.isRunning).toBe(false)
  })
})
```

- [ ] **Step 2: Verify the test fails**

```powershell
pnpm test -- src/features/automation/use-workflow-simulation.test.tsx
```

- [ ] **Step 3: Implement the hook**

Use `RUN_STEP_MS = 650`, initialize every status to `idle`, and keep a `runIdRef`. `run()` increments the run ID, sets the first node to `running` and later nodes to `queued`, awaits one timer per node, marks each completed, activates the outgoing connection, then starts the next node. Every post-timer update must return early when its captured run ID no longer equals `runIdRef.current`. On completion set `activeConnectionId` to `null` and `isRunning` false.

Use this public signature:

```ts
export function useWorkflowSimulation(
  nodes: WorkflowNodeDefinition[],
  connections: WorkflowConnection[]
): {
  statuses: Record<NodeId, ExecutionStatus>
  activeConnectionId: string | null
  isRunning: boolean
  run: () => Promise<void>
}
```

- [ ] **Step 4: Verify and commit simulation**

```powershell
pnpm test -- src/features/automation/use-workflow-simulation.test.tsx
git add dashboard/src/features/automation
git commit -m "feat: simulate sequential workflow execution"
```

### Task 4: Build the shared n8n-style canvas and inspector

**Files:**
- Create: `dashboard/src/features/automation/workflow-node.tsx`
- Create: `dashboard/src/features/automation/workflow-connections.tsx`
- Create: `dashboard/src/features/automation/node-inspector.tsx`
- Create: `dashboard/src/features/automation/workflow-canvas.tsx`
- Test: `dashboard/src/features/automation/workflow-canvas.test.tsx`

**Interfaces:**
- Consumes: `WorkflowDefinition`, execution statuses, active connection ID.
- Produces: `WorkflowCanvas({workflow,statuses,activeConnectionId,selectedNodeId,onSelectNode})`.

- [ ] **Step 1: Write failing canvas behavior tests**

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CAROUSEL_WORKFLOW } from "./workflow-fixtures"
import { WorkflowCanvas } from "./workflow-canvas"
import type { ExecutionStatus, NodeId } from "./types"

const idleStatuses = Object.fromEntries(
  CAROUSEL_WORKFLOW.nodes.map((node) => [node.id, "idle"])
) as Record<NodeId, ExecutionStatus>

it("selects nodes and exposes zoom controls", async () => {
  const user = userEvent.setup()
  const onSelectNode = vi.fn()
  render(
    <WorkflowCanvas
      workflow={CAROUSEL_WORKFLOW}
      statuses={idleStatuses}
      activeConnectionId={null}
      selectedNodeId="source"
      onSelectNode={onSelectNode}
    />
  )

  await user.click(screen.getByRole("button", { name: /write carousel copy/i }))
  expect(onSelectNode).toHaveBeenCalledWith("writer")
  await user.click(screen.getByRole("button", { name: /zoom in/i }))
  expect(screen.getByText("110%")).toBeVisible()
  await user.click(screen.getByRole("button", { name: /reset zoom/i }))
  expect(screen.getByText("100%")).toBeVisible()
})
```

- [ ] **Step 2: Verify the canvas test fails**

```powershell
pnpm test -- src/features/automation/workflow-canvas.test.tsx
```

- [ ] **Step 3: Implement node and connections**

`WorkflowNode` renders a button positioned with `left/top` percentages, a left input port, right output port, icon tile, label, provider, textual status, and result. Apply `aria-pressed={selected}` and use semantic classes. Map icon keys to `SearchIcon`, `BrainCircuitIcon`, `PenLineIcon`, `ImageIcon`, and `ScanEyeIcon`.

`WorkflowConnections` renders an absolute SVG with `viewBox="0 0 1200 500"`, one `<path>` per fixture connection, and a `<marker id="workflow-arrow">`. Active paths use `stroke="var(--primary)"`; inactive paths use `stroke="var(--border)"`. Add `strokeDasharray="7 7"` and a CSS animation only to the active connection.

- [ ] **Step 4: Implement inspector and canvas zoom**

`NodeInspector` displays `SELECTED NODE`, label, provider badge, description, Input, Output, and Latest result from the selected fixture.

`WorkflowCanvas` owns a `zoom` state starting at `1`. Zoom out clamps to `0.8`, zoom in clamps to `1.2`, and reset returns to `1`. Render a toolbar with labelled buttons and a percentage label. The inner canvas uses `transform: scale(zoom)` with top-left transform origin inside an overflow-auto viewport. Canvas height is at least `34rem`.

- [ ] **Step 5: Verify and commit the shared canvas**

```powershell
pnpm test -- src/features/automation/workflow-canvas.test.tsx
git add dashboard/src/features/automation
git commit -m "feat: add n8n-style workflow canvas"
```

### Task 5: Build LinkedIn Visual Production and eight-slide review

**Files:**
- Create: `dashboard/src/features/automation/carousel-visual-production.tsx`
- Create: `dashboard/src/features/automation/carousel-output-gallery.tsx`
- Create: `dashboard/src/features/automation/carousel-slide-dialog.tsx`
- Test: `dashboard/src/features/automation/carousel-output-gallery.test.tsx`

**Interfaces:**
- Consumes: `CarouselSlide[]`, visual node execution status.
- Produces: visible Visual Production summary and accessible individual slide review.

- [ ] **Step 1: Write failing gallery tests**

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { CarouselOutputGallery } from "./carousel-output-gallery"
import { CAROUSEL_SLIDES } from "./workflow-fixtures"

it("opens every generated slide individually", async () => {
  const user = userEvent.setup()
  render(<CarouselOutputGallery slides={CAROUSEL_SLIDES} />)

  for (const slide of CAROUSEL_SLIDES) {
    await user.click(screen.getByRole("button", { name: `Review slide ${slide.index}` }))
    expect(screen.getByRole("dialog")).toHaveTextContent(slide.title)
    await user.click(screen.getByRole("button", { name: "Close" }))
  }
})

it("navigates between slide previews", async () => {
  const user = userEvent.setup()
  render(<CarouselOutputGallery slides={CAROUSEL_SLIDES} />)
  await user.click(screen.getByRole("button", { name: "Review slide 1" }))
  await user.click(screen.getByRole("button", { name: "Next slide" }))
  expect(screen.getByRole("dialog")).toHaveTextContent(CAROUSEL_SLIDES[1].title)
})
```

- [ ] **Step 2: Verify the gallery test fails**

```powershell
pnpm test -- src/features/automation/carousel-output-gallery.test.tsx
```

- [ ] **Step 3: Implement Visual Production**

Render a section headed `Visual Production` with four shadcn cards: `Visual direction / Editorial systems`, `Format / 1080 × 1080`, `Slide set / 8 images`, and `Consistency / Type · palette · art direction`. Add a shadcn `Progress` driven by status: idle `0`, queued `15`, running `62`, completed `100`, error `0`.

- [ ] **Step 4: Implement the gallery and dialog**

Render all eight slides in a responsive `sm:grid-cols-2 lg:grid-cols-4` gallery. Every thumbnail button uses `aria-label={`Review slide ${slide.index}`}` and renders the same `CarouselSlideArtwork` used by the dialog. Artwork uses the TweakCN primary/card tokens, not literal colors.

The shadcn Dialog stores `selectedIndex: number | null`, renders a square large preview plus title/body, and provides `Previous slide`, `Next slide`, and `Close`. Disable previous at index `0` and next at `slides.length - 1`. Dialog close sets the index to `null`.

- [ ] **Step 5: Verify and commit LinkedIn review**

```powershell
pnpm test -- src/features/automation/carousel-output-gallery.test.tsx
git add dashboard/src/features/automation
git commit -m "feat: add carousel production and review gallery"
```

### Task 6: Build Newsletter production and article review

**Files:**
- Create: `dashboard/src/features/automation/newsletter-production.tsx`
- Create: `dashboard/src/features/automation/newsletter-output-preview.tsx`
- Test through: `dashboard/src/features/automation/automation-dashboard.test.tsx`

**Interfaces:**
- Consumes: `NewsletterArticle` and visual/writer execution statuses.
- Produces: matching newsletter production summary and bounded final article.

- [ ] **Step 1: Implement Newsletter production**

Render `Newsletter Production` with semantic cards for `Editorial angle`, `7 min read`, `1,420 words`, `9 citations`, lead image status, and draft status. The lead-image area uses an aspect `16/7` theme-token composition with `Lead visual` text; it does not load a remote asset.

- [ ] **Step 2: Implement the final newsletter output**

Render a section headed `Newsletter Output` containing a bounded `max-h-[42rem] overflow-y-auto` article. Include a `Draft newsletter` badge, title, deck, reading-time/word-count/citation metadata, lead visual, every fixture section heading and body, and a citations summary. If `article.sections` is empty, render `Newsletter draft unavailable`.

- [ ] **Step 3: Run type and lint checks**

```powershell
pnpm exec tsc --noEmit
pnpm lint
```

Expected: both commands exit 0.

- [ ] **Step 4: Commit Newsletter UI**

```powershell
git add dashboard/src/features/automation
git commit -m "feat: add newsletter production and review"
```

### Task 7: Integrate both workspaces into dashboard-01 and verify

**Files:**
- Create: `dashboard/src/features/automation/automation-dashboard.tsx`
- Modify: `dashboard/src/components/app-sidebar.tsx`
- Modify: `dashboard/src/components/site-header.tsx`
- Modify: `dashboard/src/app/dashboard/page.tsx`
- Modify: `dashboard/src/app/page.tsx`
- Test: `dashboard/src/features/automation/automation-dashboard.test.tsx`

**Interfaces:**
- Consumes: shared canvas, simulation hook, carousel components, newsletter components.
- Produces: complete `/dashboard?workflow=carousel|newsletter` experience.

- [ ] **Step 1: Write failing workspace tests**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AutomationDashboard } from "./automation-dashboard"

describe("AutomationDashboard", () => {
  it("renders the LinkedIn workspace without forbidden prototype UI", () => {
    render(<AutomationDashboard workflow="carousel" />)
    expect(screen.getByRole("button", { name: "Run Workflow" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Visual Production" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Carousel Output" })).toBeVisible()
    expect(screen.queryByText(/front-end prototype/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pipeline health|command center/i)).not.toBeInTheDocument()
  })

  it("renders the matching Newsletter workspace", () => {
    render(<AutomationDashboard workflow="newsletter" />)
    expect(screen.getByRole("heading", { name: "Newsletter Production" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Newsletter Output" })).toBeVisible()
    expect(screen.getByText("The systems behind dependable AI agents")).toBeVisible()
  })
})
```

- [ ] **Step 2: Verify the workspace tests fail**

```powershell
pnpm test -- src/features/automation/automation-dashboard.test.tsx
```

- [ ] **Step 3: Implement shared dashboard composition**

`AutomationDashboard` is a client component. Resolve `workflowDefinition`, initialize selected node to `source`, call `useWorkflowSimulation`, and render:

1. `SiteHeader` with active title, `isRunning`, and `onRun`.
2. A grid with `WorkflowCanvas` and `NodeInspector`.
3. Carousel production/gallery or Newsletter production/preview based on `workflow`.

Changing the `workflow` prop resets selected node to `source`. The top-level main uses `min-w-0 flex-1 space-y-6 p-4 lg:p-6`.

- [ ] **Step 4: Replace sidebar and header sample content**

Replace sidebar sample navigation with two Next.js `Link` destinations and active states:

```tsx
{ title: "LinkedIn Carousel Automation", href: "/dashboard?workflow=carousel", icon: ImagesIcon }
{ title: "Newsletter", href: "/dashboard?workflow=newsletter", icon: BookOpenTextIcon }
```

Keep the installed `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, off-canvas behavior, and user footer. Header signature:

```ts
export function SiteHeader({
  workflow,
  isRunning,
  onRun,
}: {
  workflow: WorkflowKind
  isRunning: boolean
  onRun: () => void
})
```

The button label is `Run Workflow` or `Running…`, includes `PlayIcon`, and is disabled while running.

- [ ] **Step 5: Update Next.js pages**

Use Next.js 16 asynchronous search parameters:

```tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workflow?: string }>
}) {
  const params = await searchParams
  const workflow = params.workflow === "newsletter" ? "newsletter" : "carousel"
  // existing SidebarProvider and SidebarInset wrap AutomationDashboard
}
```

Root page:

```tsx
import { redirect } from "next/navigation"

export default function Home() {
  redirect("/dashboard?workflow=carousel")
}
```

- [ ] **Step 6: Verify tests, lint, and production build**

```powershell
pnpm test
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 7: Visually verify the workspaces**

Start `pnpm dev`. At approximately 1440px and 390px widths verify:

- Both sidebar links navigate and show active state.
- Run Workflow remains at the top and sequential states are visible.
- Nodes, ports, arrows, selection, inspector, zoom in/out/reset, and dotted canvas are readable.
- Visual Production and all eight slide thumbnails render.
- Each slide opens individually; previous/next and close work.
- Newsletter shows matching production and final article review.
- Dark mode uses the supplied TweakCN palette.
- No descriptive hero copy, prototype button, command center, health, analytics, scheduling, or publishing UI appears.

- [ ] **Step 8: Commit the integrated workspaces**

```powershell
git add dashboard
git commit -m "feat: build carousel and newsletter automation workspaces"
```
