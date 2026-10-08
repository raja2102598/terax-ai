import { describe, expect, it } from "vitest";
import { SnapshotLedger } from "./snapshotLedger";

describe("SnapshotLedger", () => {
  it("treats a leaf with no recorded write as stale", () => {
    expect(new SnapshotLedger().isCurrent(1, 0)).toBe(false);
  });

  it("is current only for the exact revision last recorded", () => {
    const ledger = new SnapshotLedger();
    ledger.record(1, 7);
    expect(ledger.isCurrent(1, 7)).toBe(true);
    expect(ledger.isCurrent(1, 8)).toBe(false);
    expect(ledger.isCurrent(2, 7)).toBe(false);
  });

  it("goes stale again once the stored snapshot is dropped", () => {
    const ledger = new SnapshotLedger();
    ledger.record(1, 7);
    ledger.forget(1);
    expect(ledger.isCurrent(1, 7)).toBe(false);
  });

  it("tracks the newest revision after a rewrite", () => {
    const ledger = new SnapshotLedger();
    ledger.record(1, 7);
    ledger.record(1, 9);
    expect(ledger.isCurrent(1, 7)).toBe(false);
    expect(ledger.isCurrent(1, 9)).toBe(true);
  });
});
