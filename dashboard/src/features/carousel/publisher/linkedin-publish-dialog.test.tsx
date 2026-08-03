import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { LinkedInPublishDialog } from "./linkedin-publish-dialog"

describe("LinkedInPublishDialog", () => {
  it("explains the real public post before confirmation", () => {
    renderDialog()

    expect(screen.getByRole("dialog", { name: "Publish carousel to LinkedIn" })).toBeVisible()
    expect(screen.getByText("Ada Lovelace")).toBeVisible()
    expect(screen.getByText("AI Catalyst: The operating model")).toBeVisible()
    expect(screen.getByText("5-page PDF")).toBeVisible()
    expect(screen.getByText("Public")).toBeVisible()
    expect(screen.getByText("Clicking Publish document creates a real public LinkedIn post.")).toBeVisible()
  })

  it("closes without publishing when Cancel is clicked", async () => {
    const onConfirm = vi.fn(async () => undefined)
    const user = userEvent.setup()
    renderDialog({ onConfirm })

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("calls the final publish action", async () => {
    const onConfirm = vi.fn(async () => undefined)
    const user = userEvent.setup()
    renderDialog({ onConfirm })

    await user.click(screen.getByRole("button", { name: "Publish document" }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("closes without publishing when Escape is pressed", async () => {
    const onConfirm = vi.fn(async () => undefined)
    const user = userEvent.setup()
    renderDialog({ onConfirm })

    await user.keyboard("{Escape}")

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("accepts only one final publish click while the request is in flight", async () => {
    const publish = deferred()
    const onConfirm = vi.fn(() => publish.promise)
    const user = userEvent.setup()
    renderDialog({ onConfirm })

    const publishButton = screen.getByRole("button", { name: "Publish document" })
    await user.dblClick(publishButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Publishing document" })).toBeDisabled()
    publish.resolve()
  })
})

function renderDialog({
  onConfirm = async () => undefined,
}: {
  onConfirm?: () => Promise<void>
} = {}) {
  function ControlledDialog() {
    const [open, setOpen] = useState(true)
    return (
      <LinkedInPublishDialog
        open={open}
        onOpenChange={setOpen}
        connectedProfileName="Ada Lovelace"
        documentTitle="AI Catalyst: The operating model"
        publishing={false}
        onConfirm={onConfirm}
      />
    )
  }

  return render(<ControlledDialog />)
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
