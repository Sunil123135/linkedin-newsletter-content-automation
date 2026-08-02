# LinkedIn Automation Workspaces Design

## Goal

Build two polished, UI-only automation workspaces inside the installed shadcn `dashboard-01` shell:

1. LinkedIn Carousel Automation
2. Newsletter

Both views explain a complete content-generation flow through an authentic n8n-inspired canvas, simulated execution, node inspection, production details, and reviewable final output.

## Source foundation

- Preserve the installed `dashboard-01` sidebar, header, inset layout, responsiveness, and shadcn component conventions.
- Apply the exact TweakCN theme originally supplied by the user. The theme registry URL is blocked by the corporate TLS chain, so the already-applied theme tokens in the user-selected MIT-licensed reference repository will be used as the trusted local source.
- Use `harshith-vaddiparthy/linkedin-agency-automation` as design inspiration. Do not copy its application wholesale.
- Add an attribution notice for adapted reference code and design patterns.

## Product boundary

This milestone is frontend only.

- All nodes, sources, drafts, images, progress, and run results use typed local fixture data.
- `Run Workflow` simulates execution in the browser; it does not call Firecrawl, OpenAI, image providers, LinkedIn, or newsletter APIs.
- No authentication, persistence, scheduling, publishing, analytics, pipeline-health monitoring, or infrastructure controls are included.
- No command center, hero description, `Front-end Prototype` button, or generic dashboard metrics are included.

## Navigation and routing

The left sidebar contains two primary buttons and no unrelated product destinations:

- `LinkedIn Carousel Automation`
- `Newsletter`

The views use the existing `/dashboard` route with a `workflow` query parameter:

- `/dashboard?workflow=carousel`
- `/dashboard?workflow=newsletter`

The sidebar visibly marks the active workspace. The root route redirects to the carousel workspace.

## Shared workspace shell

Both workspaces share the same visible hierarchy:

1. Top application header with workspace title and `Run Workflow` as the primary action.
2. Main workflow area containing the n8n-inspired canvas and selected-node inspector.
3. Production section showing the current generated content or visual configuration.
4. Final output section for human review.

Changing workspaces replaces the workflow data and production/output components without replacing the dashboard shell.

## Workflow canvas

The canvas must look like an intentional workflow editor rather than a marketing diagram.

### Visual language

- Dotted grid background using theme tokens.
- Compact rectangular nodes with provider icon, action label, provider name, execution status, and result summary.
- Visible input and output ports aligned to connection direction.
- Curved SVG connections with arrowheads and clear left-to-right execution order.
- Selected-node border and focus treatment.
- Running node pulse, completed-node success state, queued state, and simulated error-ready state.
- Small canvas toolbar with zoom in, zoom out, and reset controls.
- A fit-to-workspace composition that remains readable without an eight-column board.

### Interaction model

- Nodes are selectable by pointer and keyboard.
- Selecting a node updates the inspector with its purpose, inputs, provider, output, and latest mock result.
- Zoom controls change the canvas scale within safe bounds and reset to 100%.
- Nodes are fixed rather than draggable. Dragging, graph editing, persistence, and arbitrary connection creation are outside this UI-only milestone.
- `Run Workflow` resets every node, then advances sequentially through queued, running, and completed states.
- Connections visually activate as execution moves to the next node.
- A second run safely resets the simulation instead of creating overlapping timers.

## LinkedIn Carousel Automation

### Execution flow

1. `Find Current News` — Firecrawl collects current source material.
2. `Synthesize Research` — OpenAI extracts the central thesis and evidence.
3. `Write Carousel Copy` — OpenAI creates a hook and slide-by-slide narrative.
4. `Visual Production` — OpenAI Image or Nano Banana produces the visual set.
5. `Review Carousel` — the dashboard presents every generated slide for human review.

### Visual Production section

This section remains visible below the workflow area and includes:

- Selected visual direction.
- Square LinkedIn output format.
- Eight-slide generation status.
- Consistency indicators for typography, palette, and art direction.
- A compact generation progress treatment driven by simulated workflow state.

It does not include a real generation form or provider API configuration.

### Final carousel output

- Display all eight generated carousel slides in a responsive thumbnail gallery.
- Each slide shows its sequence number and title.
- Selecting any slide opens a modal containing a larger square preview, slide number, title, supporting text, and previous/next navigation.
- Keyboard users can open a slide, move between slides, and close the modal.
- The gallery represents review only; it contains no publishing action.

## Newsletter workspace

### Execution flow

1. `Collect Sources` — Firecrawl collects current reporting and references.
2. `Build Editorial Brief` — OpenAI creates the angle, audience promise, and evidence map.
3. `Write Newsletter` — OpenAI produces the structured long-form draft.
4. `Create Lead Visual` — OpenAI Image or Nano Banana creates the newsletter artwork.
5. `Review Newsletter` — the dashboard presents the final article and lead visual.

### Production section

The matching Newsletter production section includes:

- Editorial angle.
- Target reading time and word count.
- Citation count.
- Lead-image generation state.
- Draft completion state.

### Final newsletter output

- Show a publication-shaped article preview with title, deck, metadata, lead visual, section headings, body excerpts, and citations summary.
- The preview is scrollable inside a bounded review surface.
- No edit form, publishing action, or live document persistence is included.

## Component boundaries

- `AutomationDashboard`: resolves the selected workspace and composes shared sections.
- `WorkflowHeader`: displays the current title and controls simulated execution.
- `WorkflowCanvas`: renders nodes, connections, zoom toolbar, and execution states.
- `WorkflowNode`: renders one accessible n8n-style node with ports.
- `WorkflowConnections`: renders curved, directional SVG connections.
- `NodeInspector`: renders selected-node inputs, outputs, provider, and mock results.
- `CarouselVisualProduction`: renders the LinkedIn production summary.
- `NewsletterProduction`: renders the newsletter production summary.
- `CarouselOutputGallery`: renders all slide thumbnails and selection behavior.
- `CarouselSlideDialog`: provides individual slide review and previous/next navigation.
- `NewsletterOutputPreview`: renders the bounded final article preview.
- `workflow-fixtures`: owns typed nodes, connections, slides, and newsletter fixture content.
- `useWorkflowSimulation`: owns reset-safe sequential execution state.

Each file should have one clear purpose. Workflow-specific data remains separate from shared rendering components.

## Responsive behavior

- Desktop: canvas and inspector appear side-by-side; production and output span the workspace width below.
- Tablet: inspector moves below the canvas; canvas remains horizontally readable.
- Mobile: sidebar uses the existing off-canvas trigger, nodes use a compact left-to-right canvas with horizontal overflow, and galleries reduce to one or two columns.
- The output dialog stays inside the viewport and preserves a square slide preview.

## Accessibility

- Sidebar destinations are real links with active state.
- Nodes are buttons with visible focus and `aria-pressed` selection state.
- Node status is expressed in text, not color alone.
- Canvas controls have accessible labels.
- `Run Workflow` exposes running state and is disabled during the simulation.
- The slide dialog uses the shadcn dialog focus trap and labelled controls.
- All interactive controls meet keyboard requirements and use semantic theme tokens.

## Error, empty, and running presentations

- Before a run, nodes show the latest fixture result and an idle-ready state.
- During a run, queued and running states are visible.
- If no carousel slides exist, the output section displays a review-oriented empty state.
- If newsletter content is absent, the preview displays a draft-unavailable state.
- A simulated execution can be reset without leaving stale running state.

## Testing and verification

- Unit-test workspace selection and fixture integrity.
- Test node selection and inspector updates.
- Test sequential run simulation with fake timers.
- Test zoom boundaries and reset.
- Test all eight carousel slides open individually.
- Test previous/next dialog navigation and boundary behavior.
- Test Newsletter workspace rendering and output preview.
- Run lint, unit tests, and production build.
- Visually inspect desktop and mobile layouts.
- Verify the exact TweakCN light/dark tokens are present and dark mode is active by default.
- Verify forbidden UI is absent: command center, prototype button, health monitoring, analytics, and publishing controls.

## Definition of done

The milestone is complete when both sidebar workspaces run inside `dashboard-01`, the n8n-style canvas looks authentic and supports the specified UI interactions, `Run Workflow` visibly simulates the execution sequence, Visual Production remains present, all eight carousel outputs can be reviewed individually, Newsletter has a matching production and final-preview experience, and all automated and visual checks pass without any backend dependency.

