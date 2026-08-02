"use client"

import { useState } from "react"

import { SiteHeader } from "@/components/site-header"

import { CarouselOutputGallery } from "./carousel-output-gallery"
import { CarouselVisualProduction } from "./carousel-visual-production"
import { NewsletterOutputPreview } from "./newsletter-output-preview"
import { NewsletterProduction } from "./newsletter-production"
import { NodeInspector } from "./node-inspector"
import type { NodeId, WorkflowKind } from "./types"
import { useWorkflowSimulation } from "./use-workflow-simulation"
import { WorkflowCanvas } from "./workflow-canvas"
import {
  CAROUSEL_SLIDES,
  CAROUSEL_WORKFLOW,
  NEWSLETTER_ARTICLE,
  NEWSLETTER_WORKFLOW,
} from "./workflow-fixtures"

function AutomationWorkspace({ workflow }: { workflow: WorkflowKind }) {
  const workflowDefinition =
    workflow === "newsletter" ? NEWSLETTER_WORKFLOW : CAROUSEL_WORKFLOW
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId>("source")
  const simulation = useWorkflowSimulation(
    workflowDefinition.nodes,
    workflowDefinition.connections
  )
  const selectedNode =
    workflowDefinition.nodes.find((node) => node.id === selectedNodeId) ??
    workflowDefinition.nodes[0]

  return (
    <>
      <SiteHeader
        workflow={workflow}
        isRunning={simulation.isRunning}
        onRun={() => void simulation.run()}
      />
      <main className="min-w-0 flex-1 space-y-8 p-4 lg:p-6">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_19rem]">
          <WorkflowCanvas
            workflow={workflowDefinition}
            statuses={simulation.statuses}
            activeConnectionId={simulation.activeConnectionId}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
          <NodeInspector node={selectedNode} />
        </div>

        {workflow === "carousel" ? (
          <>
            <CarouselVisualProduction status={simulation.statuses.visual} />
            <CarouselOutputGallery slides={CAROUSEL_SLIDES} />
          </>
        ) : (
          <>
            <NewsletterProduction
              article={NEWSLETTER_ARTICLE}
              visualStatus={simulation.statuses.visual}
              writerStatus={simulation.statuses.writer}
            />
            <NewsletterOutputPreview article={NEWSLETTER_ARTICLE} />
          </>
        )}
      </main>
    </>
  )
}

export function AutomationDashboard({ workflow }: { workflow: WorkflowKind }) {
  return <AutomationWorkspace key={workflow} workflow={workflow} />
}
