# Pipeline Dashboard Design

## Goal

Create the frontend foundation for the LinkedIn content automation system. The first product surface is a pipeline-only dashboard built inside the unmodified structural patterns of shadcn's `dashboard-01` block and styled with the supplied TweakCN theme.

## Approved scope

- Create a Next.js App Router application in `dashboard/`.
- Install and initialize shadcn/ui.
- Add the exact `dashboard-01` registry block before customization.
- Apply the exact TweakCN registry theme after the dashboard block is installed.
- Preserve the dashboard's sidebar, header, responsive behavior, spacing system, and component conventions.
- Replace sample dashboard content with a horizontal content pipeline.
- Use these initial stages: Research, Draft, Visuals, Review, and Ready.
- Represent newsletter and LinkedIn carousel work as content items moving through the same pipeline.

## Explicit non-goals

- No command center.
- No create-action launcher.
- No activate-workflow controls.
- No pipeline-health or infrastructure-monitoring interface.
- No Hermes or OpenClaw integration.
- No backend workflow orchestration, scraping, generation, publishing, authentication, or database in this slice.
- No redesign of the supplied dashboard shell or theme.

## Approaches considered

### 1. Recommended: dashboard block with a focused pipeline board

Install `dashboard-01`, retain its shell, and replace only its sample content with a horizontal stage board. This gives the clearest visual representation of content progress while staying faithful to the requested UI foundation.

### 2. Dashboard block with a pipeline table

Use a sortable table for every content item and its status. This handles high volume well but makes movement through the content lifecycle less immediate and is not the preferred first experience.

### 3. Dashboard block with a node diagram

Render the architecture as connected workflow nodes. This explains system topology, but it is weaker for day-to-day content tracking and risks turning the page into a workflow editor.

Approach 1 is selected. A table can later become an alternate view if real content volume justifies it.

## Page composition

The `dashboard-01` shell remains the outer application layout. Its primary content area will contain:

1. A compact page heading identifying the content pipeline.
2. Lightweight filters that affect the visible content items only.
3. A horizontally scrollable five-stage pipeline board.
4. Content cards showing title, output type, content pillar, owner/status metadata, and last-updated context.
5. Empty states that explain what belongs in each stage without introducing creation controls in this slice.

The first pass uses local typed fixture data. This isolates presentation from backend decisions and allows the dashboard and theme to be verified first.

## Component boundaries

- `PipelinePage`: assembles the pipeline view inside the dashboard shell.
- `PipelineBoard`: lays out stages and owns horizontal responsiveness.
- `PipelineColumn`: displays one lifecycle stage and its item count.
- `ContentCard`: displays one newsletter or carousel item.
- `PipelineFilters`: filters fixture data without triggering external actions.
- `pipeline-data`: typed fixture records kept separate from rendering components.

Each component has one responsibility and uses shadcn primitives and theme tokens instead of hardcoded colors.

## Responsive behavior

- Desktop: five columns in a horizontally scrollable board.
- Tablet: narrower columns with the sidebar's existing responsive behavior preserved.
- Mobile: one-column-width cards with horizontal stage navigation; no compressed five-column grid.
- Keyboard focus and horizontal overflow must remain usable without a pointer.

## Theme rules

- The supplied TweakCN registry is the source of truth for colors, radius, typography variables, shadows, and light/dark tokens.
- Registry-generated theme variables must not be manually approximated.
- Pipeline components use semantic tokens such as `background`, `card`, `border`, `muted`, and `accent`.
- Stage distinctions use restrained semantic treatments and must remain legible in both light and dark modes.

## Error and empty states

This frontend-only slice has no network errors. It must still render safely when fixture data is empty or when a stage has no items. An empty stage shows explanatory copy rather than an action button.

## Verification

- The development server starts successfully.
- The installed `dashboard-01` route renders without runtime errors.
- The TweakCN variables are present after the theme installation.
- The pipeline replaces sample analytics content inside the dashboard shell.
- Type checking and linting pass.
- The page is inspected at desktop and mobile widths.
- Both light and dark theme contrast and focus states are checked.

## Completion boundary

This slice is complete when the themed, responsive pipeline dashboard runs locally using typed fixture data. Backend integrations and operational controls require separate designs and are intentionally deferred.
