import { BookMarkedIcon, ClockIcon, QuoteIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import { NewsletterLeadVisual } from "./newsletter-production"
import type { NewsletterArticle } from "./types"

export function NewsletterOutputPreview({ article }: { article: NewsletterArticle }) {
  return (
    <section className="space-y-4" aria-labelledby="newsletter-output-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Final output
          </p>
          <h2 id="newsletter-output-title" className="font-heading text-2xl font-semibold tracking-tight">
            Newsletter Output
          </h2>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <BookMarkedIcon className="size-3.5" /> Draft newsletter
        </Badge>
      </div>

      <Card className="max-h-[42rem] overflow-y-auto py-0">
        {article.sections.length ? (
          <article className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-10 sm:py-12">
            <header className="mb-8">
              <Badge className="mb-5">Draft newsletter</Badge>
              <h3 className="max-w-3xl font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                {article.title}
              </h3>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {article.deck}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><ClockIcon className="size-3.5" /> {article.readingTime}</span>
                <span>{article.wordCount.toLocaleString()} words</span>
                <span className="flex items-center gap-1.5"><QuoteIcon className="size-3.5" /> {article.citationCount} citations</span>
              </div>
            </header>

            <NewsletterLeadVisual className="mb-10" />

            <div className="space-y-9">
              {article.sections.map((section, index) => (
                <section key={section.heading} className="grid gap-3 sm:grid-cols-[2.5rem_1fr]">
                  <span className="pt-1 font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4 className="font-heading text-2xl font-semibold tracking-tight">{section.heading}</h4>
                    <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{section.body}</p>
                  </div>
                </section>
              ))}
            </div>

            <Separator className="my-10" />
            <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Evidence summary available for editorial review.</span>
              <span className="font-mono">{article.citationCount} linked citations</span>
            </footer>
          </article>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-sm text-muted-foreground">
            Newsletter draft unavailable
          </div>
        )}
      </Card>
    </section>
  )
}
