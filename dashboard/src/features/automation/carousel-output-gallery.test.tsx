import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"

import { CarouselOutputGallery } from "./carousel-output-gallery"
import { CAROUSEL_SLIDES } from "./workflow-fixtures"

it("opens every generated slide individually", async () => {
  const user = userEvent.setup()
  render(<CarouselOutputGallery slides={CAROUSEL_SLIDES} />)

  expect(screen.getAllByRole("button", { name: /Review slide/i })).toHaveLength(5)

  for (const slide of CAROUSEL_SLIDES) {
    await user.click(screen.getByRole("button", { name: `Review slide ${slide.index}` }))
    expect(screen.getByRole("dialog")).toHaveTextContent(slide.title)
    await user.click(screen.getByRole("button", { name: "Close" }))
  }
}, 15_000)

it("navigates between slide previews", async () => {
  const user = userEvent.setup()
  render(<CarouselOutputGallery slides={CAROUSEL_SLIDES} />)
  await user.click(screen.getByRole("button", { name: "Review slide 1" }))
  await user.click(screen.getByRole("button", { name: "Next slide" }))
  expect(screen.getByRole("dialog")).toHaveTextContent(CAROUSEL_SLIDES[1].title)
})
