export const WEBGL_RECOVERY_BASE_DELAY_MS = 250;
export const WEBGL_LOSS_WINDOW_MS = 60_000;
export const WEBGL_MAX_LOSSES_IN_WINDOW = 3;

export function recentWebglLosses(losses: number[], now: number): number[] {
  return losses.filter((at) => now - at < WEBGL_LOSS_WINDOW_MS);
}

// A driver that keeps dropping the context would otherwise rebuild the glyph
// atlas forever; past the limit the slot stays on the DOM renderer until the
// window clears.
export function webglSuspended(losses: number[], now: number): boolean {
  return recentWebglLosses(losses, now).length >= WEBGL_MAX_LOSSES_IN_WINDOW;
}

export type WebglRecoveryPlan = {
  losses: number[];
  retryInMs: number | null;
};

export function planWebglRecovery(
  losses: number[],
  now: number,
): WebglRecoveryPlan {
  const next = [...recentWebglLosses(losses, now), now];
  if (next.length >= WEBGL_MAX_LOSSES_IN_WINDOW)
    return { losses: next, retryInMs: null };
  return {
    losses: next,
    retryInMs: WEBGL_RECOVERY_BASE_DELAY_MS * 2 ** (next.length - 1),
  };
}
