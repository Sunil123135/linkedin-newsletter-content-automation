import type { WorkflowConnection } from "./types"

export function WorkflowConnections({
  connections,
  activeConnectionId,
}: {
  connections: WorkflowConnection[]
  activeConnectionId: string | null
}) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox="0 0 1000 500"
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="workflow-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L7,3 z" fill="var(--muted-foreground)" />
        </marker>
      </defs>
      {connections.map((connection) => {
        const active = connection.id === activeConnectionId
        return (
          <g key={connection.id}>
            <path
              d={connection.path}
              fill="none"
              stroke="var(--background)"
              strokeWidth="8"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={connection.path}
              fill="none"
              stroke={active ? "var(--primary)" : "var(--border)"}
              strokeWidth={active ? "2.5" : "2"}
              strokeDasharray={active ? "7 7" : undefined}
              markerEnd="url(#workflow-arrow)"
              vectorEffect="non-scaling-stroke"
              className={active ? "animate-[dash_0.7s_linear_infinite]" : undefined}
              style={active ? { strokeDashoffset: 14 } : undefined}
            />
          </g>
        )
      })}
    </svg>
  )
}
