"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type {
  ExecutionStatus,
  NodeId,
  WorkflowConnection,
  WorkflowNodeDefinition,
} from "./types"

export const RUN_STEP_MS = 650

function buildStatuses(
  nodes: WorkflowNodeDefinition[],
  getStatus: (index: number) => ExecutionStatus
) {
  return Object.fromEntries(
    nodes.map((node, index) => [node.id, getStatus(index)])
  ) as Record<NodeId, ExecutionStatus>
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
    setStatuses(buildStatuses(nodes, (index) => (index === 0 ? "running" : "queued")))

    for (let index = 0; index < nodes.length; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, RUN_STEP_MS))
      if (runId !== runIdRef.current) return

      const currentNode = nodes[index]
      const nextNode = nodes[index + 1]
      const outgoingConnection = connections.find(
        (connection) => connection.from === currentNode.id
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
  }, [connections, nodes])

  return { statuses, activeConnectionId, isRunning, run }
}
