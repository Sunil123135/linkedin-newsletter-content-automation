"use client"

import { useState } from "react"

import { SiteHeader } from "@/components/site-header"
import { Card, CardContent } from "@/components/ui/card"

import { LinkedInPublisherNode } from "../carousel/publisher/linkedin-publisher-node"
import {
  LinkedInPublisherPanel,
  type LinkedInConnectionPresentation,
} from "../carousel/publisher/linkedin-publisher-panel"
import {
  toCanvasExecutionStatus,
  type LinkedInPublisherState,
} from "../carousel/publisher/linkedin-publisher-state"

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

const PUBLISHER_DETAILS_ID = "linkedin-publisher-details"

function AutomationWorkspace({ workflow }: { workflow: WorkflowKind }) {
  const workflowDefinition =
    workflow === "newsletter" ? NEWSLETTER_WORKFLOW : CAROUSEL_WORKFLOW
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId>("source")
  const [publisherState, setPublisherState] =
    useState<LinkedInPublisherState>("disconnected")
  const [publisherConnection, setPublisherConnection] =
    useState<LinkedInConnectionPresentation>({ connected: false })
  const simulation = useWorkflowSimulation(
    workflowDefinition.nodes,
    workflowDefinition.connections
  )
  const approvedArtifact = null satisfies null | {
    runId: string
    revision: number
  }
  const publisherArtifact = artifactProps(approvedArtifact)
  const selectedNode =
    workflowDefinition.nodes.find((node) => node.id === selectedNodeId) ??
    workflowDefinition.nodes[0]
  const statuses = {
    ...simulation.statuses,
    publisher: toCanvasExecutionStatus(publisherState),
  }

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
            statuses={statuses}
            activeConnectionId={simulation.activeConnectionId}
            selectedNodeId={selectedNodeId}
            selectedNodeDetailsId={
              workflow === "carousel" && selectedNodeId === "publisher"
                ? PUBLISHER_DETAILS_ID
                : undefined
            }
            onSelectNode={setSelectedNodeId}
          />
          {workflow === "carousel" && selectedNodeId === "publisher" ? (
            <div
              id={PUBLISHER_DETAILS_ID}
              role="region"
              aria-label="LinkedIn Publisher details"
              className="space-y-4"
            >
              <Card>
                <CardContent className="pt-5">
                  <LinkedInPublisherNode
                    state={publisherState}
                    connectionName={
                      publisherConnection.connected
                        ? publisherConnection.displayName
                        : undefined
                    }
                    approvedRevision={publisherArtifact.revision ?? undefined}
                  />
                </CardContent>
              </Card>
              <LinkedInPublisherPanel
                runId={publisherArtifact.runId}
                revision={publisherArtifact.revision}
                artifactReady={approvedArtifact !== null}
                onStateChange={setPublisherState}
                onConnectionPresentationChange={setPublisherConnection}
              />
            </div>
          ) : (
            <NodeInspector node={selectedNode} />
          )}
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

function artifactProps(artifact: null | { runId: string; revision: number }) {
  return {
    runId: artifact?.runId ?? null,
    revision: artifact?.revision ?? null,
  }
}

export function AutomationDashboard({ workflow }: { workflow: WorkflowKind }) {
  return <AutomationWorkspace key={workflow} workflow={workflow} />
}
