export type WorkflowKind = "carousel" | "newsletter"
export type NodeId =
  | "source"
  | "research"
  | "writer"
  | "visual"
  | "review"
  | "publisher"
export type NodeExecutionMode = "automatic" | "manual"
export type ExecutionStatus = "idle" | "queued" | "running" | "completed" | "error"

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
