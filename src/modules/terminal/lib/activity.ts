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
    return {
      ...current,
      process: event.process,
      pid: event.pid,
      ports: event.ports,
    };
  }
  return { ...current, ports: event.ports };
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
  snapshots.set(leafId, reduceTerminalActivity(snapshotFor(leafId), event));
  for (const listener of listeners) listener();
}

export function clearTerminalActivity(leafId: number): void {
  if (!snapshots.delete(leafId)) return;
  for (const listener of listeners) listener();
}

export function useTerminalActivity(leafId: number): TerminalActivitySnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshotFor(leafId),
    () => EMPTY_ACTIVITY,
  );
}
