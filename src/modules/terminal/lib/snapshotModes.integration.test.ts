import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";

import { stripDeadProgramModes } from "./snapshotModes";

const ESC = "\x1b";

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

/**
 * Ask the terminal itself whether focus reporting is on, over the wire, with
 * DECRQM (CSI ? 1004 $ p). It answers CSI ? 1004 ; Ps $ y, where Ps is 1 for
 * set and 2 for reset. Going through the protocol rather than reaching into
 * xterm internals keeps this honest about what a real pty would observe.
 */
async function focusReportingState(
  term: Terminal,
): Promise<"set" | "reset" | "unknown"> {
  let reply = "";
  const sub = term.onData((d) => {
    reply += d;
  });
  await write(term, `${ESC}[?1004$p`);
  sub.dispose();
  if (reply.includes("1004;1$y")) return "set";
  if (reply.includes("1004;2$y")) return "reset";
  return "unknown";
}

/** A slot as it looked when a TUI owned it: focus reporting on, some output. */
async function serializeTuiSession(): Promise<string> {
  const term = new Terminal({ allowProposedApi: true });
  const serializer = new SerializeAddon();
  term.loadAddon(serializer);
  await write(term, `${ESC}[?1004h${ESC}[1;32mclaude${ESC}[0m session output`);
  expect(await focusReportingState(term)).toBe("set");
  return serializer.serialize({ scrollback: 100 });
}

/** bindSlot's non-fast path: reset the slot, then replay the snapshot. */
async function rebindWithSnapshot(snapshot: string): Promise<Terminal> {
  const term = new Terminal({ allowProposedApi: true });
  term.reset();
  await write(term, snapshot);
  return term;
}

describe("restoring a snapshot into a fresh pty", () => {
  it("captures focus reporting in the snapshot when a TUI had enabled it", async () => {
    expect(await serializeTuiSession()).toContain("[?1004h");
  });

  it("reproduces the leak: replaying the raw snapshot re-enables focus reporting", async () => {
    // This is the bug. term.reset() clears the mode and the very next write
    // turns it straight back on, so a shell that never asked for focus
    // reporting starts receiving ESC[I / ESC[O.
    const term = await rebindWithSnapshot(await serializeTuiSession());
    expect(await focusReportingState(term)).toBe("set");
  });

  it("leaves focus reporting off when the snapshot is stripped first", async () => {
    const snapshot = stripDeadProgramModes(await serializeTuiSession());
    const term = await rebindWithSnapshot(snapshot);
    expect(await focusReportingState(term)).toBe("reset");
  });

  it("still restores the visible buffer after stripping", async () => {
    const snapshot = stripDeadProgramModes(await serializeTuiSession());
    const term = await rebindWithSnapshot(snapshot);
    const line = term.buffer.active.getLine(0)?.translateToString(true);
    expect(line).toContain("claude session output");
  });

  it("does not disturb a snapshot from a plain shell", async () => {
    const term = new Terminal({ allowProposedApi: true });
    const serializer = new SerializeAddon();
    term.loadAddon(serializer);
    await write(term, "raja@host:~$ ls\r\nfoo bar\r\n");
    const snapshot = serializer.serialize({ scrollback: 100 });
    expect(stripDeadProgramModes(snapshot)).toBe(snapshot);
  });
});
