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
