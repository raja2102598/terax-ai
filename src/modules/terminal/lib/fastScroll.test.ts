import { describe, expect, it } from "vitest";
import {
  lineFromThumbTop,
  markerTop,
  sameScrollPaint,
  scrollPaint,
  thumbMetrics,
} from "./fastScroll";

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

  it("paints the same thumb while a tail-following buffer grows", () => {
    const tail = (totalLines: number) =>
      scrollPaint(
        { line: totalLines - 50, totalLines, viewportLines: 50 },
        400,
      );
    expect(sameScrollPaint(tail(5_000), tail(5_001))).toBe(true);
    expect(sameScrollPaint(tail(5_000), tail(24_000))).toBe(true);
    expect(tail(5_000)).toEqual({
      top: 368,
      height: 32,
      scrollable: true,
      behind: 0,
    });
  });

  it("repaints when the user scrolls away from the tail", () => {
    const at = (line: number) =>
      scrollPaint({ line, totalLines: 5_000, viewportLines: 50 }, 400);
    expect(sameScrollPaint(at(4_950), at(4_940))).toBe(false);
    expect(at(4_940).behind).toBe(10);
  });

  it("caps the behind count where the label stops changing", () => {
    const paint = scrollPaint(
      { line: 0, totalLines: 50_000, viewportLines: 50 },
      400,
    );
    expect(paint.behind).toBe(1000);
  });

  it("reports an unscrollable buffer", () => {
    expect(
      scrollPaint({ line: 0, totalLines: 40, viewportLines: 40 }, 400)
        .scrollable,
    ).toBe(false);
  });

  it("places markers in whole pixels along the track", () => {
    expect(markerTop(250, 1000, 400)).toBe(100);
    expect(markerTop(0, 0, 400)).toBe(0);
  });
});
