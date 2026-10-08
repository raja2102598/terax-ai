import { useSyncExternalStore } from "react";

export type TerminalActivityState =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "unknown";

export type TerminalActivitySnapshot = {
  state: TerminalActivityState;
  process: string | null;
  pid: number | null;
  ports: number[];
  startedAt: number | null;
  lastExitCode: number | null;
};

export type TerminalActivityEvent =
  | { type: "command-started"; process: string | null; startedAt: number }
  | { type: "command-finished"; exitCode: number | null }
  | {
      type: "process-observed";
      process: string | null;
      pid: number | null;
      ports: number[];
    }
  | { type: "ports-changed"; ports: number[] };

const EMPTY_ACTIVITY: TerminalActivitySnapshot = {
  state: "idle",
  process: null,
  pid: null,
  ports: [],
  startedAt: null,
  lastExitCode: null,
};

export function reduceTerminalActivity(
  current: TerminalActivitySnapshot,
  event: TerminalActivityEvent,
): TerminalActivitySnapshot {
  if (event.type === "command-started") {
    return {
      ...current,
      state: "running",
      process: event.process,
      pid: null,
      startedAt: event.startedAt,
      lastExitCode: null,
    };
  }
  if (event.type === "command-finished") {
    return {
      ...current,
      state:
        event.exitCode === null
          ? "unknown"
          : event.exitCode === 0
            ? "success"
            : "failed",
      process: null,
      pid: null,
      startedAt: null,
      lastExitCode: event.exitCode,
    };
  }
  if (event.type === "process-observed") {
    // Polled every couple of seconds; keep identity when nothing moved so
    // subscribers skip the re-render.
    if (
      current.process === event.process &&
      current.pid === event.pid &&
      samePorts(current.ports, event.ports)
    )
      return current;
    return {
      ...current,
      process: event.process,
      pid: event.pid,
      ports: event.ports,
    };
  }
  if (samePorts(current.ports, event.ports)) return current;
  return { ...current, ports: event.ports };
}

function samePorts(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((port, i) => port === b[i]);
}

const snapshots = new Map<number, TerminalActivitySnapshot>();
const listeners = new Set<() => void>();

function snapshotFor(leafId: number): TerminalActivitySnapshot {
  return snapshots.get(leafId) ?? EMPTY_ACTIVITY;
}

export function reportTerminalActivity(
  leafId: number,
  event: TerminalActivityEvent,
): void {
  const current = snapshotFor(leafId);
  const next = reduceTerminalActivity(current, event);
  if (next === current) return;
  snapshots.set(leafId, next);
  for (const listener of listeners) listener();
}

export function clearTerminalActivity(leafId: number): void {
  if (!snapshots.delete(leafId)) return;
  for (const listener of listeners) listener();
}

// Module-level so React does not resubscribe on every render of a consumer.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTerminalActivity(leafId: number): TerminalActivitySnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshotFor(leafId),
    () => EMPTY_ACTIVITY,
  );
}
