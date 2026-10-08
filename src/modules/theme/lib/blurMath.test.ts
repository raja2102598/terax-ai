import { describe, expect, it } from "vitest";
import {
  blurRgba,
  boxRadiiForSigma,
  displayScale,
  downscaleSize,
  hasTransparency,
  shouldRecomputeForViewport,
  sigmaForCanvasPx,
} from "./blurMath";

function solid(
  width: number,
  height: number,
  rgba: [number, number, number, number],
) {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) buf.set(rgba, i);
  return buf;
}

function pixel(
  buf: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  c: number,
) {
  return buf[(y * width + x) * 4 + c];
}

describe("boxRadiiForSigma", () => {
  it("returns no-op radii for sigma 0", () => {
    expect(boxRadiiForSigma(0)).toEqual([0, 0, 0]);
  });

  it("returns odd box widths whose variance approximates sigma squared", () => {
    const sigma = 10;
    const radii = boxRadiiForSigma(sigma);
    expect(radii).toHaveLength(3);
    const variance = radii
      .map((r) => {
        const w = 2 * r + 1;
        return (w * w - 1) / 12;
      })
      .reduce((a, b) => a + b, 0);
    expect(Math.abs(variance - sigma * sigma) / (sigma * sigma)).toBeLessThan(
      0.05,
    );
  });

  it("keeps radii non-negative integers", () => {
    for (const sigma of [0.3, 1, 2.5, 7, 17]) {
      for (const r of boxRadiiForSigma(sigma)) {
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("blurRgba", () => {
  it("keeps a uniform opaque image exactly uniform", () => {
    const src = solid(16, 12, [200, 30, 90, 255]);
    const out = blurRgba(src, 16, 12, 4);
    expect(out).toEqual(src);
  });

  it("keeps a uniform translucent image uniform within rounding", () => {
    const src = solid(16, 12, [200, 30, 90, 128]);
    const out = blurRgba(src, 16, 12, 4);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i + 3]).toBe(128);
      expect(Math.abs(out[i] - 200)).toBeLessThanOrEqual(1);
      expect(Math.abs(out[i + 1] - 30)).toBeLessThanOrEqual(1);
      expect(Math.abs(out[i + 2] - 90)).toBeLessThanOrEqual(1);
    }
  });

  it("spreads an impulse symmetrically and lowers its peak", () => {
    const size = 21;
    const src = solid(size, size, [0, 0, 0, 255]);
    const c = (10 * size + 10) * 4;
    src[c] = 255;
    const out = blurRgba(src, size, size, 2);

    const peak = pixel(out, size, 10, 10, 0);
    expect(peak).toBeLessThan(255);
    expect(peak).toBeGreaterThan(0);
    expect(pixel(out, size, 7, 10, 0)).toBe(pixel(out, size, 13, 10, 0));
    expect(pixel(out, size, 10, 7, 0)).toBe(pixel(out, size, 10, 13, 0));
    expect(pixel(out, size, 8, 12, 0)).toBe(pixel(out, size, 12, 8, 0));
    expect(pixel(out, size, 7, 10, 0)).toBeGreaterThan(0);
  });

  it("preserves buffer length and fully transparent or opaque alpha", () => {
    const size = 9;
    const clear = blurRgba(solid(size, size, [10, 20, 30, 0]), size, size, 3);
    expect(clear.length).toBe(size * size * 4);
    expect(clear.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);

    const opaque = blurRgba(
      solid(size, size, [10, 20, 30, 255]),
      size,
      size,
      3,
    );
    expect(opaque.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
  });

  it("is a no-op copy for sigma 0 and tiny sigma", () => {
    const src = solid(8, 8, [1, 2, 3, 255]);
    src[0] = 250;
    expect(blurRgba(src, 8, 8, 0)).toEqual(src);
    expect(blurRgba(src, 8, 8, 0.01)).toEqual(src);
    expect(blurRgba(src, 8, 8, 0)).not.toBe(src);
  });

  it("rejects a buffer that does not match the dimensions", () => {
    expect(() => blurRgba(new Uint8ClampedArray(10), 2, 2, 1)).toThrow();
  });
});

describe("sigmaForCanvasPx", () => {
  it("divides the CSS blur by the display scale", () => {
    expect(sigmaForCanvasPx(12, 3)).toBe(4);
    expect(sigmaForCanvasPx(64, 3.75)).toBeCloseTo(17.07, 2);
  });

  it("clamps negative blur to zero", () => {
    expect(sigmaForCanvasPx(-4, 2)).toBe(0);
  });
});

describe("displayScale", () => {
  it("uses the cover scale of the larger axis", () => {
    expect(displayScale(1920, 1080, 512, 288)).toBeCloseTo(3.75, 5);
    expect(displayScale(800, 1000, 512, 256)).toBeCloseTo(3.90625, 5);
  });
});

describe("downscaleSize", () => {
  it("caps the long side and preserves aspect ratio", () => {
    expect(downscaleSize(4000, 2000, 512)).toEqual({ width: 512, height: 256 });
  });

  it("never upscales", () => {
    expect(downscaleSize(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });

  it("keeps the short side at least one pixel", () => {
    expect(downscaleSize(1, 1000, 512)).toEqual({ width: 1, height: 512 });
  });
});

describe("shouldRecomputeForViewport", () => {
  const last = { width: 1000, height: 800 };

  it("ignores changes up to the threshold", () => {
    expect(shouldRecomputeForViewport(last, { width: 1100, height: 800 })).toBe(
      false,
    );
  });

  it("recomputes for grow and shrink beyond the threshold", () => {
    expect(shouldRecomputeForViewport(last, { width: 1200, height: 800 })).toBe(
      true,
    );
    expect(shouldRecomputeForViewport(last, { width: 800, height: 800 })).toBe(
      true,
    );
  });
});

describe("hasTransparency", () => {
  it("detects any non-opaque pixel", () => {
    expect(
      hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 1, 2, 3, 254])),
    ).toBe(true);
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255]))).toBe(false);
  });
});
