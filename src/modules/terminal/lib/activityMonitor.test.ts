import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { reportTerminalActivity } from "./activity";
import {
  forgetTerminalActivity,
  formatActivityDuration,
  observeTerminalActivity,
  planFinishedNotice,
} from "./activityMonitor";

vi.mock("./activity", () => ({
  reportTerminalActivity: vi.fn(),
  clearTerminalActivity: vi.fn(),
}));

const report = vi.mocked(reportTerminalActivity);
const LEAF = 3;
const host = { ptyId: () => 9, watched: () => true };

function documentStub(hidden = false) {
  vi.stubGlobal("document", { hidden, hasFocus: () => true });
}

beforeEach(() => {
  vi.useFakeTimers();
  documentStub();
  invoke.mockReset().mockResolvedValue({ process: "node", pid: 41, ports: [] });
  report.mockClear();
});

afterEach(() => {
  forgetTerminalActivity(LEAF);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("observeTerminalActivity", () => {
  it("ignores everything until a command starts", () => {
    observeTerminalActivity(LEAF, { type: "prompt-start" }, host);
    observeTerminalActivity(
      LEAF,
      { type: "end-of-command", exitCode: 0 },
      host,
    );
    expect(report).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("polls only while a command runs and stops on its exit status", async () => {
    observeTerminalActivity(
      LEAF,
      { type: "end-of-input", command: " npm run dev " },
      host,
    );
    expect(report).toHaveBeenCalledWith(
      LEAF,
      expect.objectContaining({
        type: "command-started",
        process: "npm run dev",
      }),
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith("pty_activity", { id: 9 });

    observeTerminalActivity(
      LEAF,
      { type: "end-of-command", exitCode: 2 },
      host,
    );
    expect(report).toHaveBeenLastCalledWith(LEAF, {
      type: "command-finished",
      exitCode: 2,
    });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("never overlaps process scans", async () => {
    let finish: (value: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    observeTerminalActivity(LEAF, { type: "end-of-input" }, host);
    await vi.advanceTimersByTimeAsync(6000);
    expect(invoke).toHaveBeenCalledTimes(1);
    finish({ process: null, pid: null, ports: [] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("skips scans while the window is hidden or the pty is gone", async () => {
    documentStub(true);
    observeTerminalActivity(LEAF, { type: "end-of-input" }, host);
    await vi.advanceTimersByTimeAsync(4000);
    expect(invoke).not.toHaveBeenCalled();
    forgetTerminalActivity(LEAF);

    documentStub(false);
    observeTerminalActivity(
      LEAF,
      { type: "end-of-input" },
      { ...host, ptyId: () => null },
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("drops a scan that returns after the command ended", async () => {
    let finish: (value: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    observeTerminalActivity(LEAF, { type: "end-of-input" }, host);
    observeTerminalActivity(
      LEAF,
      { type: "end-of-command", exitCode: 0 },
      host,
    );
    report.mockClear();
    finish({ process: "node", pid: 1, ports: [3000] });
    await vi.advanceTimersByTimeAsync(0);
    expect(report).not.toHaveBeenCalled();
  });

  it("treats a prompt with no exit status as an unknown result", () => {
    observeTerminalActivity(LEAF, { type: "end-of-input" }, host);
    observeTerminalActivity(LEAF, { type: "prompt-start" }, host);
    expect(report).toHaveBeenLastCalledWith(LEAF, {
      type: "command-finished",
      exitCode: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no timer behind when the leaf is disposed mid-command", () => {
    observeTerminalActivity(LEAF, { type: "end-of-input" }, host);
    forgetTerminalActivity(LEAF);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("planFinishedNotice", () => {
  const base = { exitCode: 0, elapsedMs: 1000, watched: false };

  it("says nothing about a pane the user is looking at", () => {
    expect(
      planFinishedNotice({
        ...base,
        exitCode: 1,
        watched: true,
        windowFocused: true,
      }),
    ).toBeNull();
  });

  it("uses the OS when the window is not focused", () => {
    expect(planFinishedNotice({ ...base, windowFocused: false })).toEqual({
      channel: "os",
      title: "Terminal task completed",
      body: "Finished in the background",
    });
  });

  it("toasts failures and long tasks in the focused window, nothing else", () => {
    expect(planFinishedNotice({ ...base, windowFocused: true })).toBeNull();
    expect(
      planFinishedNotice({ ...base, exitCode: 3, windowFocused: true })
        ?.channel,
    ).toBe("toast-error");
    expect(
      planFinishedNotice({ ...base, elapsedMs: 95_000, windowFocused: true }),
    ).toEqual({
      channel: "toast-success",
      title: "Terminal task completed",
      body: "Finished after 1m 35s",
    });
  });

  it("does not call an unknown exit status a failure", () => {
    expect(
      planFinishedNotice({ ...base, exitCode: null, windowFocused: false })
        ?.title,
    ).toBe("Terminal task completed");
  });
});

describe("formatActivityDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatActivityDuration(900)).toBe("0s");
    expect(formatActivityDuration(42_000)).toBe("42s");
    expect(formatActivityDuration(125_000)).toBe("2m 5s");
  });
});
