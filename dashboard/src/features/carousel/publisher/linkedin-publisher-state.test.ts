import { describe, expect, it } from "vitest"

import { toCanvasExecutionStatus } from "./linkedin-publisher-state"

describe("toCanvasExecutionStatus", () => {
  it.each([
    ["disconnected", "idle"],
    ["locked", "idle"],
    ["ready", "idle"],
    ["preparing_pdf", "running"],
    ["registering_upload", "running"],
    ["uploading_document", "running"],
    ["creating_post", "running"],
    ["published", "completed"],
    ["failed", "error"],
  ] as const)("maps %s to %s", (state, expected) => {
    expect(toCanvasExecutionStatus(state)).toBe(expected)
  })
})
