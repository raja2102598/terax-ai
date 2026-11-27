import { invoke } from "@tauri-apps/api/core";
import type { GhosttyTerminalEvent } from "@terax/ghostty-core/protocol";
import { clearTerminalActivity, reportTerminalActivity } from "./activity";

const POLL_INTERVAL_MS = 2000;
const LONG_TASK_MS = 30_000;

export type ActivityHost = {
  /** The leaf's live pty, or null before spawn and after exit. */
  ptyId(): number | null;
  /** The pane is on screen and holds focus, so its result needs no notice. */
  watched(): boolean;
};

type PtyActivity = {
  process: string | null;
  pid: number | null;
  ports: number[];
};

type Monitor = {
  startedAt: number | null;
  timer: ReturnType<typeof setInterval> | null;
  inFlight: boolean;
};

export type FinishedNotice = {
  channel: "toast-error" | "toast-success" | "os";
  title: string;
  body: string;
};

const monitors = new Map<number, Monitor>();

/**
 * How a finished command is announced. Nothing when the user is looking at
 * the pane; in the focused window only failures and long tasks are worth a
 * toast; an unfocused window always gets an OS notification.
 */
export function planFinishedNotice(input: {
  exitCode: number | null;
  elapsedMs: number;
  watched: boolean;
  windowFocused: boolean;
}): FinishedNotice | null {
  if (input.watched) return null;
  const failed = input.exitCode !== null && input.exitCode !== 0;
  const long = input.elapsedMs >= LONG_TASK_MS;
  const title = failed ? "Terminal task failed" : "Terminal task completed";
  const body = long
    ? `Finished after ${formatActivityDuration(input.elapsedMs)}`
    : "Finished in the background";
  if (!input.windowFocused) return { channel: "os", title, body };
  if (failed) return { channel: "toast-error", title, body };
  return long ? { channel: "toast-success", title, body } : null;
}

export function formatActivityDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

/**
 * Feeds OSC 133 command boundaries into the activity store. Runs only on
 * those events, never per output chunk; the process poll lives only while a
 * command is running.
 */
export function observeTerminalActivity(
  leafId: number,
  event: GhosttyTerminalEvent,
  host: ActivityHost,
): void {
  if (event.type === "end-of-input") {
    const monitor = monitorFor(leafId);
    const startedAt = Date.now();
    monitor.startedAt = startedAt;
    reportTerminalActivity(leafId, {
      type: "command-started",
      process: event.command?.trim() || null,
      startedAt,
    });
    startPolling(leafId, monitor, host);
    return;
  }
  const monitor = monitors.get(leafId);
  if (!monitor || monitor.startedAt === null) return;
  if (event.type === "end-of-command") {
    finish(leafId, monitor, event.exitCode);
    announce(leafId, event.exitCode, monitor, host);
    monitor.startedAt = null;
  } else if (event.type === "prompt-start") {
    // A prompt with no end-of-command before it: the exit status is unknown.
    finish(leafId, monitor, null);
    monitor.startedAt = null;
  }
}

export function forgetTerminalActivity(leafId: number): void {
  const monitor = monitors.get(leafId);
  if (monitor) stopPolling(monitor);
  monitors.delete(leafId);
  clearTerminalActivity(leafId);
}

function monitorFor(leafId: number): Monitor {
  let monitor = monitors.get(leafId);
  if (!monitor) {
    monitor = { startedAt: null, timer: null, inFlight: false };
    monitors.set(leafId, monitor);
  }
  return monitor;
}

function finish(
  leafId: number,
  monitor: Monitor,
  exitCode: number | null,
): void {
  stopPolling(monitor);
  reportTerminalActivity(leafId, { type: "command-finished", exitCode });
}

function announce(
  leafId: number,
  exitCode: number | null,
  monitor: Monitor,
  host: ActivityHost,
): void {
  const notice = planFinishedNotice({
    exitCode,
    elapsedMs: monitor.startedAt === null ? 0 : Date.now() - monitor.startedAt,
    watched: host.watched(),
    windowFocused: document.hasFocus(),
  });
  if (!notice) return;
  if (notice.channel === "os") {
    void import("@/modules/agents/lib/notify").then(({ osNotify }) =>
      osNotify(notice.title, notice.body),
    );
    return;
  }
  void import("sonner").then(({ toast }) => {
    const options = {
      description: notice.body,
      id: `terminal-task-${leafId}`,
    };
    if (notice.channel === "toast-error") toast.error(notice.title, options);
    else toast.success(notice.title, options);
  });
}

function startPolling(
  leafId: number,
  monitor: Monitor,
  host: ActivityHost,
): void {
  if (monitor.timer !== null) return;
  // Each call scans the process tree: never overlap calls, and skip it while
  // the window is hidden since nothing shows the result.
  const refresh = () => {
    const id = host.ptyId();
    if (id === null || monitor.inFlight || document.hidden) return;
    monitor.inFlight = true;
    void invoke<PtyActivity>("pty_activity", { id })
      .then((activity) => {
        if (monitors.get(leafId) !== monitor || monitor.startedAt === null)
          return;
        reportTerminalActivity(leafId, {
          type: "process-observed",
          ...activity,
        });
      })
      .catch(() => {})
      .finally(() => {
        monitor.inFlight = false;
      });
  };
  refresh();
  monitor.timer = setInterval(refresh, POLL_INTERVAL_MS);
}

function stopPolling(monitor: Monitor): void {
  if (monitor.timer === null) return;
  clearInterval(monitor.timer);
  monitor.timer = null;
}
