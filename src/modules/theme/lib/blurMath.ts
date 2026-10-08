const BOX_PASSES = 3;
const MIN_SIGMA = 0.05;

export function boxRadiiForSigma(
  sigma: number,
  passes: number = BOX_PASSES,
): number[] {
  if (!(sigma >= MIN_SIGMA)) return Array.from({ length: passes }, () => 0);
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower -= 1;
  const upper = lower + 2;
  const m = Math.round(
    (12 * sigma * sigma -
      passes * lower * lower -
      4 * passes * lower -
      3 * passes) /
      (-4 * lower - 4),
  );
  return Array.from(
    { length: passes },
    (_, i) => ((i < m ? lower : upper) - 1) / 2,
  );
}

export function sigmaForCanvasPx(
  blurCssPx: number,
  displayScale: number,
): number {
  if (!(displayScale > 0)) return 0;
  return Math.max(0, blurCssPx) / displayScale;
}

export function displayScale(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  return Math.max(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
}

export function downscaleSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function shouldRecomputeForViewport(
  last: { width: number; height: number },
  next: { width: number; height: number },
  threshold = 0.15,
): boolean {
  const dw = Math.abs(next.width / last.width - 1);
  const dh = Math.abs(next.height / last.height - 1);
  return Math.max(dw, dh) > threshold;
}

export function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) return true;
  }
  return false;
}

export function blurRgba(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (src.length !== width * height * 4) {
    throw new Error("RGBA buffer does not match the given dimensions");
  }
  if (!(sigma >= MIN_SIGMA)) return new Uint8ClampedArray(src);

  const premul = new Float64Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3] / 255;
    premul[i] = src[i] * alpha;
    premul[i + 1] = src[i + 1] * alpha;
    premul[i + 2] = src[i + 2] * alpha;
    premul[i + 3] = src[i + 3];
  }

  const a = premul;
  const b = new Float64Array(src.length);
  for (const r of boxRadiiForSigma(sigma)) {
    if (r === 0) continue;
    for (let y = 0; y < height; y++) blurLine(a, b, y * width * 4, 4, width, r);
    for (let x = 0; x < width; x++) blurLine(b, a, x * 4, width * 4, height, r);
  }

  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const alpha = a[i + 3];
    if (alpha > 0) {
      out[i] = (a[i] * 255) / alpha;
      out[i + 1] = (a[i + 1] * 255) / alpha;
      out[i + 2] = (a[i + 2] * 255) / alpha;
    }
    out[i + 3] = alpha;
  }
  return out;
}

function blurLine(
  src: Float64Array,
  dst: Float64Array,
  base: number,
  stride: number,
  n: number,
  r: number,
): void {
  const span = 2 * r + 1;
  const at = (i: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[base + at(k) * stride + c];
    for (let i = 0; i < n; i++) {
      dst[base + i * stride + c] = sum / span;
      sum +=
        src[base + at(i + r + 1) * stride + c] -
        src[base + at(i - r) * stride + c];
    }
  }
}
