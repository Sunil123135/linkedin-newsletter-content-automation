import {
  BookOpenTextIcon,
  FileTextIcon,
  ImageIcon,
  QuoteIcon,
  ScanEyeIcon,
  TimerIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import type { ExecutionStatus, NewsletterArticle } from "./types"

export function NewsletterLeadVisual({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative isolate aspect-[16/7] overflow-hidden rounded-xl border bg-card p-[6%] ${className}`}
    >
      <div aria-hidden="true" className="absolute -top-1/2 right-[4%] -z-10 aspect-square h-[180%] rounded-full border-[2.5rem] border-primary/10" />
      <div aria-hidden="true" className="absolute right-[13%] bottom-[-24%] -z-10 h-[68%] w-[34%] rotate-12 rounded-[45%] bg-chart-2/20" />
      <div className="flex h-full max-w-[68%] flex-col justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          <ImageIcon className="size-3.5" /> Lead visual
        </div>
        <p className="font-heading text-[clamp(1.35rem,4vw,3.8rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">
          Dependable agents are designed as systems.
        </p>
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Automation Studio · Issue 014
        </p>
      </div>
    </div>
  )
}

export function NewsletterProduction({
  article,
  visualStatus,
  writerStatus,
}: {
  article: NewsletterArticle
  visualStatus: ExecutionStatus
  writerStatus: ExecutionStatus
}) {
  const items = [
    { label: "Editorial angle", value: "AI systems · reliability", icon: BookOpenTextIcon },
    { label: "Reading time", value: article.readingTime, icon: TimerIcon },
    { label: "Draft length", value: `${article.wordCount.toLocaleString()} words`, icon: FileTextIcon },
    { label: "Evidence", value: `${article.citationCount} citations`, icon: QuoteIcon },
  ]

  return (
    <section className="space-y-4" aria-labelledby="newsletter-production-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Editorial assembly
          </p>
          <h2 id="newsletter-production-title" className="font-heading text-2xl font-semibold tracking-tight">
            Newsletter Production
          </h2>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1.5 capitalize">
            <FileTextIcon className="size-3" /> Draft {writerStatus}
          </Badge>
          <Badge variant="outline" className="gap-1.5 capitalize">
            <ScanEyeIcon className="size-3" /> Lead image {visualStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <NewsletterLeadVisual />
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <Card key={item.label} className="gap-0 py-0">
              <CardContent className="flex h-full min-h-28 flex-col justify-between gap-4 p-4">
                <item.icon className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{item.label}</p>
                  <p className="mt-1 text-sm font-medium">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
