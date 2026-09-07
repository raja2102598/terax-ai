import { describe, expect, it } from "vitest";
import {
  reduceTerminalActivity,
  type TerminalActivitySnapshot,
} from "./activity";

const idle: TerminalActivitySnapshot = {
  state: "idle",
  process: null,
  pid: null,
  ports: [],
  startedAt: null,
  lastExitCode: null,
};

describe("reduceTerminalActivity", () => {
  it("keeps a completed task result after the foreground process ends", () => {
    const running = reduceTerminalActivity(idle, {
      type: "command-started",
      process: "pnpm dev",
      startedAt: 100,
    });
    const completed = reduceTerminalActivity(running, {
      type: "command-finished",
      exitCode: 0,
    });

    expect(completed).toEqual({
      state: "success",
      process: null,
      pid: null,
      ports: [],
      startedAt: null,
      lastExitCode: 0,
    });
  });

  it("marks a nonzero command result as failed", () => {
    const result = reduceTerminalActivity(
      { ...idle, state: "running", process: "cargo test", startedAt: 100 },
      { type: "command-finished", exitCode: 1 },
    );

    expect(result.state).toBe("failed");
    expect(result.lastExitCode).toBe(1);
  });

  it("keeps an unknown status distinct from a failed command", () => {
    const result = reduceTerminalActivity(
      { ...idle, state: "running", process: "shell", startedAt: 100 },
      { type: "command-finished", exitCode: null },
    );

    expect(result.state).toBe("unknown");
  });
});
