import { describe, expect, it } from "vitest";
import { lineFromThumbTop, thumbMetrics } from "./fastScroll";

describe("terminal fast scroll", () => {
  const state = { line: 450, totalLines: 1000, viewportLines: 100 };

  it("maps the viewport onto a draggable thumb", () => {
    expect(thumbMetrics(state, 500)).toEqual({
      top: 225,
      height: 50,
      maxTop: 450,
    });
  });

  it("keeps the thumb usable for very large buffers", () => {
    expect(
      thumbMetrics({ line: 0, totalLines: 100_000, viewportLines: 50 }, 400),
    ).toEqual({ top: 0, height: 32, maxTop: 368 });
  });

  it("clamps drag positions and maps them back to terminal lines", () => {
    expect(lineFromThumbTop(225, 450, state)).toBe(450);
    expect(lineFromThumbTop(999, 450, state)).toBe(900);
    expect(lineFromThumbTop(-10, 450, state)).toBe(0);
  });
});
