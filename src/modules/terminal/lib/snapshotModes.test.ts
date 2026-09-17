import { describe, expect, it } from "vitest";

import { dropAlternateScreen, stripDeadProgramModes } from "./snapshotModes";

const ESC = "\x1b";

describe("stripDeadProgramModes", () => {
  it("drops focus reporting, the mode that leaks ^[[I / ^[[O into a fresh shell", () => {
    const snapshot = `${ESC}[?1004hhello`;
    expect(stripDeadProgramModes(snapshot)).toBe("hello");
  });

  it("drops mouse tracking and its encoding modes", () => {
    const snapshot = `${ESC}[?1000h${ESC}[?1002h${ESC}[?1003h${ESC}[?1006h${ESC}[?9h`;
    expect(stripDeadProgramModes(snapshot)).toBe("");
  });

  it("drops bracketed paste and application cursor keys", () => {
    const snapshot = `${ESC}[?2004h${ESC}[?1h`;
    expect(stripDeadProgramModes(snapshot)).toBe("");
  });

  it("drops application keypad, which SerializeAddon emits as [?66h", () => {
    expect(stripDeadProgramModes(`${ESC}[?66h`)).toBe("");
  });

  it("drops the render modes too: they are appended after the buffer, so they only affect the new shell", () => {
    // SerializeAddon appends _serializeModes() last, after both buffers, so
    // every mode in a snapshot shapes what the *fresh* shell prints, not the
    // restored contents. Origin, insert and reverse-wraparound all belong to
    // the dead program.
    expect(stripDeadProgramModes(`${ESC}[?6h${ESC}[?45h${ESC}[4h`)).toBe("");
  });

  it("drops [?7l, which turns wraparound off and would stop long commands wrapping", () => {
    expect(stripDeadProgramModes(`${ESC}[?7l`)).toBe("");
  });

  it("covers every sequence _serializeModes can emit", () => {
    const emitted = [
      "[?1h",
      "[?66h",
      "[?2004h",
      "[4h",
      "[?6h",
      "[?45h",
      "[?1004h",
      "[?7l",
      "[?9h",
      "[?1000h",
      "[?1002h",
      "[?1003h",
    ]
      .map((m) => ESC + m)
      .join("");
    expect(stripDeadProgramModes(emitted)).toBe("");
  });

  it("keeps mode resets, which are already the safe direction", () => {
    const snapshot = `${ESC}[?1004l${ESC}[?1000l`;
    expect(stripDeadProgramModes(snapshot)).toBe(snapshot);
  });

  it("strips only the offending params from a combined set", () => {
    // 25 (cursor visibility) is not one of the modes _serializeModes emits,
    // so it must survive alongside the mouse modes being removed.
    expect(stripDeadProgramModes(`${ESC}[?1000;1006;25h`)).toBe(`${ESC}[?25h`);
  });

  it("does not confuse a mode whose digits prefix another", () => {
    // 100 is not in the strip set even though 1000 and 1004 are.
    expect(stripDeadProgramModes(`${ESC}[?100h`)).toBe(`${ESC}[?100h`);
  });

  it("preserves ordinary terminal content and SGR styling", () => {
    const snapshot = `${ESC}[1;32mraja@host${ESC}[0m:~$ ${ESC}[?1004h`;
    expect(stripDeadProgramModes(snapshot)).toBe(
      `${ESC}[1;32mraja@host${ESC}[0m:~$ `,
    );
  });

  it("leaves a snapshot with no private modes untouched", () => {
    expect(stripDeadProgramModes("plain output\r\n")).toBe("plain output\r\n");
  });
});

describe("dropAlternateScreen", () => {
  it("drops the alternate-buffer section a TUI left in the snapshot", () => {
    // SerializeAddon appends `[?1049h[H` plus the alt buffer when the session
    // was serialized with vim/htop on screen. Replaying that would strand the
    // fresh shell drawing inside a dead program's alternate buffer.
    const snapshot = `scrollback line${ESC}[?1049h${ESC}[Hvim contents here`;
    expect(dropAlternateScreen(snapshot)).toBe("scrollback line");
  });

  it("keeps a normal-buffer snapshot exactly as it is", () => {
    const snapshot = `raja@host:~$ ls${ESC}[0m\r\nfoo`;
    expect(dropAlternateScreen(snapshot)).toBe(snapshot);
  });

  it("drops everything when the snapshot is entirely alternate buffer", () => {
    expect(dropAlternateScreen(`${ESC}[?1049h${ESC}[Hhtop`)).toBe("");
  });

  it("composes with the mode strip without reintroducing either", () => {
    const snapshot = `out${ESC}[?1004h${ESC}[?1049h${ESC}[Htui`;
    const clean = stripDeadProgramModes(dropAlternateScreen(snapshot));
    expect(clean).toBe("out");
  });
});
