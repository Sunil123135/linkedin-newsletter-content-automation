"use client"

import { useMemo, useState } from "react"

import { SiteHeader } from "@/components/site-header"
import { NodeInspector } from "@/features/automation/node-inspector"
import type { ExecutionStatus, NodeId } from "@/features/automation/types"
import { useWorkflowSimulation } from "@/features/automation/use-workflow-simulation"
import { WorkflowCanvas } from "@/features/automation/workflow-canvas"

import { NEWSLETTER_ARTICLE, NEWSLETTER_WORKFLOW } from "./newsletter-fixtures"
import { NewsletterOutputPreview } from "./newsletter-output-preview"
import { NewsletterProduction } from "./newsletter-production"
import { NewsletterPublishControl } from "./newsletter-publish-control"

const generationNodes = NEWSLETTER_WORKFLOW.nodes.filter((node) => node.id !== "publish")
const generationConnections = NEWSLETTER_WORKFLOW.connections.filter(
  (connection) => connection.to !== "publish"
)

export function NewsletterWorkspace() {
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId>("source")
  const [publishStatus, setPublishStatus] = useState<ExecutionStatus>("idle")
  const simulation = useWorkflowSimulation(generationNodes, generationConnections)
  const statuses = useMemo(
    () => ({ ...simulation.statuses, publish: publishStatus }),
    [publishStatus, simulation.statuses]
  )
  const selectedNode =
    NEWSLETTER_WORKFLOW.nodes.find((node) => node.id === selectedNodeId) ??
    NEWSLETTER_WORKFLOW.nodes[0]
  const reviewReady = statuses.review === "completed"

  function run() {
    setPublishStatus("idle")
    void simulation.run()
  }

  return (
    <>
      <SiteHeader
        workflow="newsletter"
        isRunning={simulation.isRunning}
        onRun={run}
      />
      <main className="min-w-0 flex-1 space-y-8 p-4 lg:p-6">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_19rem]">
          <WorkflowCanvas
            workflow={NEWSLETTER_WORKFLOW}
            statuses={statuses}
            activeConnectionId={
              publishStatus === "running" ? "review-publish" : simulation.activeConnectionId
            }
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
          <NodeInspector node={selectedNode} />
        </div>

        <NewsletterProduction
          article={NEWSLETTER_ARTICLE}
          visualStatus={statuses.visual}
          writerStatus={statuses.writer}
        />
        <NewsletterOutputPreview article={NEWSLETTER_ARTICLE} />
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="newsletter-publish-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Final delivery
              </p>
              <h2 id="newsletter-publish-title" className="font-heading text-xl font-semibold">
                Publish with Resend
              </h2>
            </div>
            <NewsletterPublishControl
              reviewReady={reviewReady}
              onStatusChange={setPublishStatus}
            />
          </div>
        </section>
      </main>
    </>
  )
}
