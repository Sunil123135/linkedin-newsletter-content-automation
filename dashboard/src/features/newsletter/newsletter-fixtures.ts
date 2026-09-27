import type { WorkflowConnection, WorkflowDefinition, WorkflowNodeDefinition } from "@/features/automation/types"

import type { NewsletterArticle } from "./types"

const ids = ["source", "research", "writer", "visual", "review", "publish"] as const
const positions = [2, 18, 34, 50, 66, 82]

const nodes: WorkflowNodeDefinition[] = [
  { id: "source", executionMode: "automatic", label: "Collect Sources", provider: "Research", description: "Collects primary reporting and technical references.", input: "Editorial topic and sources", output: "Source library", result: "18 sources collected", position: { x: positions[0], y: 28 }, icon: "search" },
  { id: "research", executionMode: "automatic", label: "Build Editorial Brief", provider: "OpenAI", description: "Creates a structured argument from the research.", input: "Source library", output: "Editorial brief", result: "Brief approved", position: { x: positions[1], y: 28 }, icon: "brain" },
  { id: "writer", executionMode: "automatic", label: "Write Newsletter", provider: "OpenAI", description: "Drafts the long-form issue with citations.", input: "Editorial brief", output: "Newsletter draft", result: "1,420 words drafted", position: { x: positions[2], y: 28 }, icon: "write" },
  { id: "visual", executionMode: "automatic", label: "Create Lead Visual", provider: "OpenAI Image", description: "Creates a lead visual aligned to the editorial theme.", input: "Newsletter draft and art direction", output: "Lead visual", result: "Lead visual generated", position: { x: positions[3], y: 28 }, icon: "image" },
  { id: "review", executionMode: "automatic", label: "Review Newsletter", provider: "Dashboard", description: "Combines the article and visual for editorial review.", input: "Draft and lead visual", output: "Review-ready issue", result: "Ready for review", position: { x: positions[4], y: 28 }, icon: "review" },
  { id: "publish", executionMode: "manual", label: "Publish Newsletter", provider: "Resend", description: "Sends the approved issue to the fixed server-configured test recipient.", input: "Review-ready issue", output: "Resend delivery request", result: "Waiting for confirmation", position: { x: positions[5], y: 28 }, icon: "publish" },
]

const connections: WorkflowConnection[] = ids.slice(0, -1).map((id, index) => ({
  id: `${id}-${ids[index + 1]}`,
  from: id,
  to: ids[index + 1],
  path: `M${(positions[index] / 100) * 1000 + 208} 190 L${(positions[index + 1] / 100) * 1000} 190`,
}))

export const NEWSLETTER_WORKFLOW: WorkflowDefinition = {
  kind: "newsletter",
  title: "Newsletter",
  nodes,
  connections,
}

export const NEWSLETTER_ARTICLE: NewsletterArticle = {
  id: "issue-014",
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
