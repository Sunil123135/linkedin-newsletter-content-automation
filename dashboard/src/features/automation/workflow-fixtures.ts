import type {
  CarouselSlide,
  NodeId,
  WorkflowConnection,
  WorkflowDefinition,
  WorkflowNodeDefinition,
} from "./types"

const CAROUSEL_ORDERED_IDS: NodeId[] = [
  "source",
  "research",
  "writer",
  "visual",
  "review",
  "publisher",
]
const POSITIONS = [
  { x: 4, y: 10 },
  { x: 27, y: 10 },
  { x: 50, y: 10 },
  { x: 73, y: 10 },
  { x: 50, y: 66 },
  { x: 73, y: 66 },
]
const CONNECTION_PATHS = [
  "M248 112 C258 112 260 112 270 112",
  "M478 112 C488 112 490 112 500 112",
  "M708 112 C718 112 720 112 730 112",
  "M938 112 C980 112 980 260 790 260 C620 260 500 300 500 392",
  "M708 392 C718 392 720 392 730 392",
]

function connections(orderedIds: NodeId[]): WorkflowConnection[] {
  return orderedIds.slice(0, -1).map((id, index) => ({
    id: `${id}-${orderedIds[index + 1]}`,
    from: id,
    to: orderedIds[index + 1],
    path: CONNECTION_PATHS[index],
  }))
}

function nodes(
  values: Omit<WorkflowNodeDefinition, "id" | "position" | "executionMode">[],
  orderedIds: NodeId[]
): WorkflowNodeDefinition[] {
  return values.map((value, index) => ({
    ...value,
    id: orderedIds[index],
    executionMode: "automatic",
    position: POSITIONS[index],
  }))
}

export const CAROUSEL_WORKFLOW: WorkflowDefinition = {
  kind: "carousel",
  title: "LinkedIn Carousel Automation",
  nodes: [
    ...nodes([
    { label: "Find Current News", provider: "Firecrawl", description: "Collects timely AI-agent stories from trusted sources.", input: "Topic and source allowlist", output: "Ranked source bundle", result: "24 sources found", icon: "search" },
    { label: "Synthesize Research", provider: "OpenAI", description: "Distills evidence, tensions, and useful angles.", input: "Ranked source bundle", output: "Research brief", result: "6 themes synthesized", icon: "brain" },
    { label: "Write Carousel Copy", provider: "OpenAI", description: "Turns the brief into a concise five-slide narrative.", input: "Research brief", output: "Slide copy", result: "5 slides drafted", icon: "write" },
    { label: "Visual Production", provider: "OpenAI Image · Nano Banana", description: "Applies one art direction across the full slide set.", input: "Slide copy and visual system", output: "Rendered image set", result: "5 images generated", icon: "image" },
    { label: "Review Carousel", provider: "Dashboard", description: "Presents every generated image for individual review.", input: "Rendered image set", output: "Review-ready carousel", result: "Ready for review", icon: "review" },
    ], CAROUSEL_ORDERED_IDS),
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
    },
  ],
  connections: connections(CAROUSEL_ORDERED_IDS),
}

export const CAROUSEL_SLIDES: CarouselSlide[] = [
  { id: "slide-1", index: 1, eyebrow: "AI AGENT SYSTEMS", title: "A polished demo is not a dependable agent", body: "Reliability begins after the happy path ends.", footer: "The systems behind dependable AI agents" },
  { id: "slide-2", index: 2, eyebrow: "01 · DEMOS", title: "Agent demos hide the operating system", body: "One successful run tells you very little about the workflow around it.", footer: "Design the loop, not just the prompt" },
  { id: "slide-3", index: 3, eyebrow: "02 · RECOVERY", title: "Failure recovery is a product feature", body: "Retries, checkpoints, and useful fallbacks decide whether automation survives reality.", footer: "Expect partial failure" },
  { id: "slide-4", index: 4, eyebrow: "03 · VALIDATION", title: "Validate every irreversible step", body: "Check structured output, sources, and intent before an agent acts downstream.", footer: "Trust is built at boundaries" },
  { id: "slide-5", index: 5, eyebrow: "04 · OBSERVABILITY", title: "If you cannot see it, you cannot improve it", body: "Trace decisions, tool calls, latency, and cost across the complete run.", footer: "Make the invisible legible" },
]
