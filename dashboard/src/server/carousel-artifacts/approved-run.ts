import { z } from "zod"

export const carouselSlideAssetSchema = z.object({
  id: z.string().min(1),
  index: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  storageKey: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg"]),
  width: z.literal(1080),
  height: z.literal(1080),
  altText: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
})

export const approvedCarouselRunSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.literal("approved"),
  caption: z.string().min(1).max(3000),
  documentTitle: z.string().min(1).max(200),
  slides: z.array(carouselSlideAssetSchema).length(5),
}).superRefine((run, context) => {
  const indexes = run.slides.map((slide) => slide.index)
  if (indexes.join(",") !== "1,2,3,4,5") {
    context.addIssue({ code: "custom", path: ["slides"], message: "Slides must be ordered 1 through 5" })
  }
})

export type ApprovedCarouselRun = z.infer<typeof approvedCarouselRunSchema>
export type CarouselSlideAsset = z.infer<typeof carouselSlideAssetSchema>
