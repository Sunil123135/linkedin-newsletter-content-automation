import { ArrowLeftIcon, ArrowRightIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import type { CarouselSlide } from "./types"

export function CarouselSlideArtwork({
  slide,
  className = "",
}: {
  slide: CarouselSlide
  className?: string
}) {
  const isAlternate = slide.index % 2 === 0

  return (
    <div
      className={`relative isolate flex aspect-square w-full flex-col overflow-hidden rounded-[inherit] border bg-card p-[8%] text-card-foreground ${className}`}
    >
      <div
        aria-hidden="true"
        className="absolute -top-[18%] -right-[14%] -z-10 aspect-square w-[62%] rounded-full border-[clamp(14px,4vw,44px)] border-primary/15"
      />
      <div
        aria-hidden="true"
        className={`absolute bottom-[12%] -left-[8%] -z-10 h-[19%] w-[58%] -rotate-6 rounded-full ${isAlternate ? "bg-chart-2/25" : "bg-primary/12"}`}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-[clamp(0.42rem,1.2vw,0.7rem)] font-bold tracking-[0.18em] text-muted-foreground uppercase">
          {slide.eyebrow}
        </span>
        <span className="font-mono text-[clamp(0.55rem,1.5vw,0.78rem)] font-medium text-muted-foreground">
          {String(slide.index).padStart(2, "0")} / 08
        </span>
      </div>

      <div className="my-auto max-w-[92%]">
        <div className="mb-[7%] h-1 w-[18%] rounded-full bg-primary" />
        <p className="font-heading text-[clamp(1rem,3.1vw,2.45rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
          {slide.title}
        </p>
        <p className="mt-[6%] max-w-[88%] text-[clamp(0.5rem,1.35vw,0.9rem)] leading-relaxed text-muted-foreground">
          {slide.body}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-border/70 pt-[5%] text-[clamp(0.42rem,1vw,0.66rem)] text-muted-foreground">
        <span className="font-medium">{slide.footer}</span>
        <span className="font-mono">AUTOMATION STUDIO</span>
      </div>
    </div>
  )
}

export function CarouselSlideDialog({
  slides,
  selectedIndex,
  onSelectedIndexChange,
}: {
  slides: CarouselSlide[]
  selectedIndex: number | null
  onSelectedIndexChange: (index: number | null) => void
}) {
  const slide = selectedIndex === null ? null : slides[selectedIndex]

  return (
    <Dialog
      open={selectedIndex !== null}
      onOpenChange={(open) => !open && onSelectedIndexChange(null)}
    >
      <DialogContent showCloseButton={false} className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        {slide ? (
          <>
            <DialogHeader className="pr-8">
              <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Carousel output · Slide {slide.index} of {slides.length}
              </p>
              <DialogTitle className="text-xl leading-tight">{slide.title}</DialogTitle>
              <DialogDescription>{slide.body}</DialogDescription>
            </DialogHeader>
            <CarouselSlideArtwork slide={slide} className="mx-auto max-w-[34rem] shadow-lg" />
            <DialogFooter className="justify-between sm:justify-between">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Previous slide"
                  disabled={selectedIndex === 0}
                  onClick={() => onSelectedIndexChange(Math.max(0, selectedIndex! - 1))}
                >
                  <ArrowLeftIcon /> Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Next slide"
                  disabled={selectedIndex === slides.length - 1}
                  onClick={() => onSelectedIndexChange(Math.min(slides.length - 1, selectedIndex! + 1))}
                >
                  Next <ArrowRightIcon />
                </Button>
              </div>
              <Button type="button" onClick={() => onSelectedIndexChange(null)}>
                <XIcon /> Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
