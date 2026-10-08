import {
  blurRgba,
  displayScale,
  downscaleSize,
  hasTransparency,
  sigmaForCanvasPx,
} from "@/modules/theme/lib/blurMath";

const MAX_CANVAS_SIDE = 512;
const JPEG_QUALITY = 0.85;

export async function renderBlurredBlob(
  source: Blob,
  blurCssPx: number,
  viewportWidth: number,
  viewportHeight: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = downscaleSize(
      bitmap.width,
      bitmap.height,
      MAX_CANVAS_SIDE,
    );
    const sigma = sigmaForCanvasPx(
      blurCssPx,
      displayScale(viewportWidth, viewportHeight, width, height),
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas 2D context unavailable");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const alpha = hasTransparency(image.data);
      const blurred = blurRgba(image.data, width, height, sigma);
      ctx.putImageData(new ImageData(blurred, width, height), 0, 0);
      return await encode(canvas, alpha);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}

function encode(canvas: HTMLCanvasElement, alpha: boolean): Promise<Blob> {
  const type = alpha ? "image/png" : "image/jpeg";
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("failed to encode blurred image")),
      type,
      JPEG_QUALITY,
    );
  });
}
