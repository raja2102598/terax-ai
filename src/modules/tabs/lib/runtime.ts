const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export function formatRuntime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / SECOND));
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return minutes
    ? `${minutes}:${String(seconds % 60).padStart(2, "0")}`
    : `${seconds}s`;
}

/** Milliseconds until `formatRuntime(elapsed)` next changes. */
export function msUntilRuntimeChange(elapsed: number): number {
  const step = elapsed >= HOUR ? MINUTE : SECOND;
  return step - (Math.max(0, elapsed) % step);
}
