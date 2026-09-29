import { describe, expect, it } from "vitest";
import { formatRuntime, msUntilRuntimeChange } from "./runtime";

describe("formatRuntime", () => {
  it("shows seconds, then m:ss, then hours and minutes", () => {
    expect(formatRuntime(4_900)).toBe("4s");
    expect(formatRuntime(65_000)).toBe("1:05");
    expect(formatRuntime(59 * 60_000 + 59_000)).toBe("59:59");
    expect(formatRuntime(3_600_000)).toBe("1h 0m");
    expect(formatRuntime(2 * 3_600_000 + 7 * 60_000 + 30_000)).toBe("2h 7m");
  });
});

describe("msUntilRuntimeChange", () => {
  it("ticks on second boundaries under an hour", () => {
    expect(msUntilRuntimeChange(0)).toBe(1_000);
    expect(msUntilRuntimeChange(1_250)).toBe(750);
  });

  it("ticks on minute boundaries once past an hour", () => {
    expect(msUntilRuntimeChange(3_600_000)).toBe(60_000);
    expect(msUntilRuntimeChange(3_600_000 + 45_000)).toBe(15_000);
  });

  it("lands exactly where the label changes", () => {
    for (const elapsed of [0, 999, 59_500, 3_599_999, 3_600_001, 7_259_000]) {
      const next = elapsed + msUntilRuntimeChange(elapsed);
      expect(formatRuntime(next)).not.toBe(formatRuntime(next - 1));
    }
  });
});
