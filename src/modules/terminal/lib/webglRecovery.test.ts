import { describe, expect, it } from "vitest";
import {
  planWebglRecovery,
  recentWebglLosses,
  WEBGL_LOSS_WINDOW_MS,
  webglSuspended,
} from "./webglRecovery";

describe("webgl context loss recovery", () => {
  it("retries a first loss after the base delay", () => {
    expect(planWebglRecovery([], 1_000)).toEqual({
      losses: [1_000],
      retryInMs: 250,
    });
  });

  it("backs off on a second loss inside the window", () => {
    expect(planWebglRecovery([1_000], 2_000).retryInMs).toBe(500);
  });

  it("stops retrying once losses hit the limit", () => {
    const plan = planWebglRecovery([1_000, 2_000], 3_000);
    expect(plan.retryInMs).toBeNull();
    expect(webglSuspended(plan.losses, 3_001)).toBe(true);
  });

  it("forgets losses older than the window", () => {
    const later = 3_000 + WEBGL_LOSS_WINDOW_MS;
    expect(recentWebglLosses([1_000, 2_000, 3_000], later)).toEqual([]);
    expect(webglSuspended([1_000, 2_000, 3_000], later)).toBe(false);
    expect(planWebglRecovery([1_000, 2_000, 3_000], later).retryInMs).toBe(250);
  });

  it("is not suspended below the limit", () => {
    expect(webglSuspended([1_000, 2_000], 2_500)).toBe(false);
  });
});
