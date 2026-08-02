"use client"

import { useState } from "react"
import { ExpandIcon, ImagesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardHeader } from "@/components/ui/card"

import { CarouselSlideArtwork, CarouselSlideDialog } from "./carousel-slide-dialog"
import type { CarouselSlide } from "./types"

export function CarouselOutputGallery({ slides }: { slides: CarouselSlide[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  return (
    <section className="space-y-4" aria-labelledby="carousel-output-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Final output
          </p>
          <h2 id="carousel-output-title" className="font-heading text-2xl font-semibold tracking-tight">
            Carousel Output
          </h2>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <ImagesIcon className="size-3.5" /> {slides.length} generated images
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {slides.map((slide, index) => (
          <Card key={slide.id} className="group gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
            <button
              type="button"
              aria-label={`Review slide ${slide.index}`}
              onClick={() => setSelectedIndex(index)}
              className="relative cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <CarouselSlideArtwork slide={slide} className="rounded-none border-0" />
              <span className="absolute inset-0 grid place-items-center bg-background/0 opacity-0 transition-all group-hover:bg-background/45 group-hover:opacity-100 group-focus-within:bg-background/45 group-focus-within:opacity-100">
                <span className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-sm">
                  <ExpandIcon className="size-3.5" /> Review image
                </span>
              </span>
            </button>
            <CardHeader className="flex-row items-center justify-between gap-2 border-t px-3 py-2.5">
              <p className="truncate text-xs font-medium">Slide {slide.index}</p>
              <span className="font-mono text-[9px] text-muted-foreground">1080 × 1080</span>
            </CardHeader>
          </Card>
        ))}
      </div>

      <CarouselSlideDialog
        slides={slides}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
      />
    </section>
  )
}
