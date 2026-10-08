export type TerminalScrollState = {
  line: number;
  totalLines: number;
  viewportLines: number;
};

export type ThumbMetrics = { top: number; height: number; maxTop: number };

export function thumbMetrics(
  state: TerminalScrollState,
  trackHeight: number,
  minHeight = 32,
): ThumbMetrics {
  const height = Math.min(
    trackHeight,
    Math.max(minHeight, (state.viewportLines / state.totalLines) * trackHeight),
  );
  const maxTop = Math.max(0, trackHeight - height);
  const maxLine = Math.max(0, state.totalLines - state.viewportLines);
  const top = maxLine === 0 ? 0 : (state.line / maxLine) * maxTop;
  return { top: Math.min(maxTop, Math.max(0, top)), height, maxTop };
}

export function lineFromThumbTop(
  top: number,
  maxTop: number,
  state: TerminalScrollState,
): number {
  const maxLine = Math.max(0, state.totalLines - state.viewportLines);
  if (maxTop <= 0) return 0;
  return Math.round((Math.min(maxTop, Math.max(0, top)) / maxTop) * maxLine);
}

export type ScrollPaint = {
  top: number;
  height: number;
  scrollable: boolean;
  behind: number;
};

const BEHIND_LABEL_CAP = 1000;

// What the scrollbar actually paints. A tail-following terminal grows
// totalLines on every line while these values stay put.
export function scrollPaint(
  state: TerminalScrollState,
  trackHeight: number,
): ScrollPaint {
  const metrics = thumbMetrics(state, trackHeight);
  const maxLine = Math.max(0, state.totalLines - state.viewportLines);
  return {
    top: Math.round(metrics.top),
    height: Math.round(metrics.height),
    scrollable: maxLine > 0,
    behind: Math.min(BEHIND_LABEL_CAP, Math.max(0, maxLine - state.line)),
  };
}

export function sameScrollPaint(a: ScrollPaint, b: ScrollPaint): boolean {
  return (
    a.top === b.top &&
    a.height === b.height &&
    a.scrollable === b.scrollable &&
    a.behind === b.behind
  );
}

export function markerTop(
  line: number,
  totalLines: number,
  trackHeight: number,
): number {
  return Math.round((line / Math.max(1, totalLines)) * trackHeight);
}
