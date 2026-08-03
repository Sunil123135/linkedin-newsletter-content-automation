import { ExternalLinkIcon, FileTextIcon, Globe2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

import type { LinkedInPublisherState } from "./linkedin-publisher-state"

export interface LinkedInPublisherNodeProps {
  state: LinkedInPublisherState
  connected: boolean
  connectionName?: string
  approvedRevision?: number
  postUrl?: string
}

export function LinkedInPublisherNode({
  state,
  connected,
  connectionName,
  approvedRevision,
  postUrl,
}: LinkedInPublisherNodeProps) {
  return (
    <section aria-label="LinkedIn publisher summary" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {connected ? `Connected as ${connectionName ?? "LinkedIn member"}` : "LinkedIn not connected"}
        </p>
        <Badge variant="outline" className="capitalize">{state.replaceAll("_", " ")}</Badge>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2"><FileTextIcon className="size-4" /> 5-page PDF</p>
        <p className="flex items-center gap-2"><Globe2Icon className="size-4" /> Public</p>
        <p>{approvedRevision ? `Approved revision ${approvedRevision}` : "No approved revision"}</p>
      </div>
      {postUrl ? (
        <a
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href={postUrl}
          target="_blank"
          rel="noreferrer"
        >
          View last LinkedIn post <ExternalLinkIcon className="size-3.5" />
        </a>
      ) : null}
    </section>
  )
}
