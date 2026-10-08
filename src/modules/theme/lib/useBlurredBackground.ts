import { shouldRecomputeForViewport } from "@/modules/theme/lib/blurMath";
import { renderBlurredBlob } from "@/modules/theme/lib/renderBlurredBlob";
import { useEffect, useRef, useState } from "react";

export type BlurredBackground =
  | { status: "pending" }
  | { status: "ready"; url: string }
  | { status: "failed" };

type Result = { key: string; url: string | null };
type Committed = { key: string; blur: number; width: number; height: number };

export function useBlurredBackground(
  source: Blob | null,
  key: string | null,
  blur: number,
  settled: boolean,
): BlurredBackground | null {
  const [result, setResult] = useState<Result | null>(null);
  const committedRef = useRef<Committed | null>(null);

  useEffect(() => {
    if (!result?.url) return;
    const url = result.url;
    return () => URL.revokeObjectURL(url);
  }, [result]);

  useEffect(() => {
    if (!source || !key || !settled) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const last = committedRef.current;
    if (
      last &&
      last.key === key &&
      last.blur === blur &&
      !shouldRecomputeForViewport(last, { width, height })
    ) {
      return;
    }
    let alive = true;
    void renderBlurredBlob(source, blur, width, height)
      .catch(() => null)
      .then((blob) => {
        if (!alive) return;
        committedRef.current = { key, blur, width, height };
        setResult({ key, url: blob ? URL.createObjectURL(blob) : null });
      });
    return () => {
      alive = false;
    };
  }, [source, key, blur, settled]);

  if (!source || !key) return null;
  if (!result || result.key !== key) return { status: "pending" };
  return result.url
    ? { status: "ready", url: result.url }
    : { status: "failed" };
}
