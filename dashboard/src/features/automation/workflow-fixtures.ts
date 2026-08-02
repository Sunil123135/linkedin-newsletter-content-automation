import type {
  CarouselSlide,
  NewsletterArticle,
  NodeId,
  WorkflowConnection,
  WorkflowDefinition,
  WorkflowNodeDefinition,
} from "./types"

const ORDERED_IDS: NodeId[] = ["source", "research", "writer", "visual", "review"]
const POSITIONS = [
  { x: 4, y: 10 },
  { x: 27, y: 10 },
  { x: 50, y: 10 },
  { x: 73, y: 10 },
  { x: 50, y: 66 },
]
const CONNECTION_PATHS = [
  "M220 135 C270 135 280 135 330 135",
  "M500 135 C550 135 560 135 610 135",
  "M780 135 C830 135 840 135 890 135",
  "M1000 180 C1000 270 720 270 720 340",
]

function connections(): WorkflowConnection[] {
  return ORDERED_IDS.slice(0, -1).map((id, index) => ({
    id: `${id}-${ORDERED_IDS[index + 1]}`,
    from: id,
    to: ORDERED_IDS[index + 1],
    path: CONNECTION_PATHS[index],
  }))
}

function nodes(
  values: Omit<WorkflowNodeDefinition, "id" | "position">[]
): WorkflowNodeDefinition[] {
  return values.map((value, index) => ({
    ...value,
    id: ORDERED_IDS[index],
    position: POSITIONS[index],
  }))
}

export const CAROUSEL_WORKFLOW: WorkflowDefinition = {
  kind: "carousel",
  title: "LinkedIn Carousel Automation",
  nodes: nodes([
    { label: "Find Current News", provider: "Firecrawl", description: "Collects timely AI-agent stories from trusted sources.", input: "Topic and source allowlist", output: "Ranked source bundle", result: "24 sources found", icon: "search" },
    { label: "Synthesize Research", provider: "OpenAI", description: "Distills evidence, tensions, and useful angles.", input: "Ranked source bundle", output: "Research brief", result: "6 themes synthesized", icon: "brain" },
    { label: "Write Carousel Copy", provider: "OpenAI", description: "Turns the brief into a concise eight-slide narrative.", input: "Research brief", output: "Slide copy", result: "8 slides drafted", icon: "write" },
    { label: "Visual Production", provider: "OpenAI Image · Nano Banana", description: "Applies one art direction across the full slide set.", input: "Slide copy and visual system", output: "Rendered image set", result: "8 images generated", icon: "image" },
    { label: "Review Carousel", provider: "Dashboard", description: "Presents every generated image for individual review.", input: "Rendered image set", output: "Review-ready carousel", result: "Ready for review", icon: "review" },
  ]),
  connections: connections(),
}

export const NEWSLETTER_WORKFLOW: WorkflowDefinition = {
  kind: "newsletter",
  title: "Newsletter",
  nodes: nodes([
    { label: "Collect Sources", provider: "Firecrawl", description: "Collects primary reporting and technical references.", input: "Editorial topic and sources", output: "Source library", result: "18 sources collected", icon: "search" },
    { label: "Build Editorial Brief", provider: "OpenAI", description: "Creates a structured argument from the research.", input: "Source library", output: "Editorial brief", result: "Brief approved", icon: "brain" },
    { label: "Write Newsletter", provider: "OpenAI", description: "Drafts the long-form issue with citations.", input: "Editorial brief", output: "Newsletter draft", result: "1,420 words drafted", icon: "write" },
    { label: "Create Lead Visual", provider: "OpenAI Image · Nano Banana", description: "Creates a lead visual aligned to the editorial theme.", input: "Newsletter draft and art direction", output: "Lead visual", result: "Lead visual generated", icon: "image" },
    { label: "Review Newsletter", provider: "Dashboard", description: "Combines the article and visual in a review workspace.", input: "Draft and lead visual", output: "Review-ready issue", result: "Ready for review", icon: "review" },
  ]),
  connections: connections(),
}

export const CAROUSEL_SLIDES: CarouselSlide[] = [
  { id: "slide-1", index: 1, eyebrow: "AI AGENT SYSTEMS", title: "A polished demo is not a dependable agent", body: "Reliability begins after the happy path ends.", footer: "The systems behind dependable AI agents" },
  { id: "slide-2", index: 2, eyebrow: "01 · DEMOS", title: "Agent demos hide the operating system", body: "One successful run tells you very little about the workflow around it.", footer: "Design the loop, not just the prompt" },
  { id: "slide-3", index: 3, eyebrow: "02 · RECOVERY", title: "Failure recovery is a product feature", body: "Retries, checkpoints, and useful fallbacks decide whether automation survives reality.", footer: "Expect partial failure" },
  { id: "slide-4", index: 4, eyebrow: "03 · VALIDATION", title: "Validate every irreversible step", body: "Check structured output, sources, and intent before an agent acts downstream.", footer: "Trust is built at boundaries" },
  { id: "slide-5", index: 5, eyebrow: "04 · OBSERVABILITY", title: "If you cannot see it, you cannot improve it", body: "Trace decisions, tool calls, latency, and cost across the complete run.", footer: "Make the invisible legible" },
  { id: "slide-6", index: 6, eyebrow: "05 · HUMAN REVIEW", title: "Human review belongs inside the workflow", body: "Put judgment where the stakes are highest—not in a separate rescue process.", footer: "Escalate with context" },
  { id: "slide-7", index: 7, eyebrow: "06 · DESIGN", title: "Good workflows make state explicit", body: "Clear inputs, outputs, ownership, and status turn a chain of tools into a system.", footer: "State is the shared language" },
  { id: "slide-8", index: 8, eyebrow: "THE TAKEAWAY", title: "Engineer the loop around the model", body: "Dependable agents come from orchestration, validation, recovery, and review working together.", footer: "Save this framework" },
]

export const NEWSLETTER_ARTICLE: NewsletterArticle = {
  title: "The systems behind dependable AI agents",
  deck: "Why the workflow around a model—not the model alone—determines whether an agent can earn trust in production.",
  readingTime: "7 min read",
  wordCount: 1420,
  citationCount: 9,
  sections: [
    { heading: "The demo-to-production gap", body: "A compelling agent demo proves that a model can complete a path once. Production asks a harder question: can the whole system recover, explain itself, and preserve useful state when that path breaks?" },
    { heading: "Reliability lives at the boundaries", body: "Source quality, typed handoffs, validation, and explicit checkpoints matter because each tool boundary introduces uncertainty. The best workflows make those transitions visible and testable." },
    { heading: "Human judgment is part of the architecture", body: "High-stakes review should not be bolted on after generation. It should be a first-class node with the evidence, outputs, and context a reviewer needs to make a fast, informed decision." },
    { heading: "Design the operating loop", body: "Teams that treat orchestration, observability, and recovery as product surfaces can improve the complete loop instead of endlessly tuning isolated prompts." },
  ],
}
