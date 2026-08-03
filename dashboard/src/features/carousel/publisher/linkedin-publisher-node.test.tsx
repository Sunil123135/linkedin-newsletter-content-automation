import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LinkedInPublisherNode } from "./linkedin-publisher-node"

describe("LinkedInPublisherNode", () => {
  it("summarizes the approved document and last public post without credential data", () => {
    render(
      <LinkedInPublisherNode
        state="published"
        connected
        connectionName="Ada Lovelace"
        approvedRevision={3}
        postUrl="https://www.linkedin.com/feed/update/urn:li:share:post-789"
      />,
    )

    expect(screen.getByText("Connected as Ada Lovelace")).toBeVisible()
    expect(screen.getByText("5-page PDF")).toBeVisible()
    expect(screen.getByText("Public")).toBeVisible()
    expect(screen.getByText("Approved revision 3")).toBeVisible()
    expect(screen.getByRole("link", { name: "View last LinkedIn post" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/feed/update/urn:li:share:post-789",
    )
  })

  it("keeps connected presentation when LinkedIn omits the display name", () => {
    render(<LinkedInPublisherNode state="locked" connected />)

    expect(screen.getByText("Connected as LinkedIn member")).toBeVisible()
    expect(screen.queryByText("LinkedIn not connected")).not.toBeInTheDocument()
  })
})
