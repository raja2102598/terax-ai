// Remembers which buffer revision was last written per leaf so an unchanged
// terminal is not serialized again on every persistence flush.
export class SnapshotLedger {
  private readonly written = new Map<number, number>();

  isCurrent(leafId: number, revision: number): boolean {
    return this.written.get(leafId) === revision;
  }

  record(leafId: number, revision: number): void {
    this.written.set(leafId, revision);
  }

  forget(leafId: number): void {
    this.written.delete(leafId);
  }
}
