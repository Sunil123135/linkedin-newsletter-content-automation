"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  ExecutionStatus,
  NodeId,
  WorkflowConnection,
  WorkflowNodeDefinition,
} from "./types"

export const RUN_STEP_MS = 650

const IDLE_STATUSES: Record<NodeId, ExecutionStatus> = {
  source: "idle",
  research: "idle",
  writer: "idle",
  visual: "idle",
  review: "idle",
  publish: "idle",
  publisher: "idle",
}

function buildStatuses(
  nodes: WorkflowNodeDefinition[],
  getStatus: (node: WorkflowNodeDefinition, index: number) => ExecutionStatus
): Record<NodeId, ExecutionStatus> {
  return nodes.reduce(
    (statuses, node, index) => ({
      ...statuses,
      [node.id]: getStatus(node, index),
    }),
    IDLE_STATUSES
  )
}

export function useWorkflowSimulation(
  nodes: WorkflowNodeDefinition[],
  connections: WorkflowConnection[]
): {
  statuses: Record<NodeId, ExecutionStatus>
  activeConnectionId: string | null
  isRunning: boolean
  run: () => Promise<void>
} {
  const automaticNodes = useMemo(
    () => nodes.filter((node) => node.executionMode === "automatic"),
    [nodes]
  )
  const automaticNodeIds = useMemo(
    () => new Set(automaticNodes.map((node) => node.id)),
    [automaticNodes]
  )
  const [statuses, setStatuses] = useState(() => buildStatuses(nodes, () => "idle"))
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const runIdRef = useRef(0)

  useEffect(
    () => () => {
      runIdRef.current += 1
    },
    []
  )

  const run = useCallback(async () => {
    const runId = ++runIdRef.current
    setIsRunning(true)
    setActiveConnectionId(null)
    setStatuses(
      buildStatuses(nodes, (node) => {
        const index = automaticNodes.indexOf(node)
        if (index < 0) return "idle"
        return index === 0 ? "running" : "queued"
      })
    )

    for (let index = 0; index < automaticNodes.length; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, RUN_STEP_MS))
      if (runId !== runIdRef.current) return

      const currentNode = automaticNodes[index]
      const nextNode = automaticNodes[index + 1]
      const outgoingConnection = connections.find(
        (connection) =>
          connection.from === currentNode.id &&
          automaticNodeIds.has(connection.from) &&
          automaticNodeIds.has(connection.to)
      )

      setStatuses((current) => ({
        ...current,
        [currentNode.id]: "completed",
        ...(nextNode ? { [nextNode.id]: "running" } : {}),
      }))
      setActiveConnectionId(outgoingConnection?.id ?? null)
    }

    if (runId === runIdRef.current) {
      setActiveConnectionId(null)
      setIsRunning(false)
    }
  }, [automaticNodeIds, automaticNodes, connections, nodes])

  return { statuses, activeConnectionId, isRunning, run }
}
