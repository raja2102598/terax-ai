import { describe, expect, it } from "vitest";

import { dropAlternateScreen, stripInputReportingModes } from "./snapshotModes";

const ESC = "\x1b";

describe("stripInputReportingModes", () => {
  it("drops focus reporting, the mode that leaks ^[[I / ^[[O into a fresh shell", () => {
    const snapshot = `${ESC}[?1004hhello`;
    expect(stripInputReportingModes(snapshot)).toBe("hello");
  });

  it("drops mouse tracking and its encoding modes", () => {
    const snapshot = `${ESC}[?1000h${ESC}[?1002h${ESC}[?1003h${ESC}[?1006h${ESC}[?9h`;
    expect(stripInputReportingModes(snapshot)).toBe("");
  });

  it("drops bracketed paste and application cursor keys", () => {
    const snapshot = `${ESC}[?2004h${ESC}[?1h`;
    expect(stripInputReportingModes(snapshot)).toBe("");
  });

  it("drops application keypad, which SerializeAddon emits as [?66h", () => {
    expect(stripInputReportingModes(`${ESC}[?66h`)).toBe("");
  });

  it("keeps rendering modes that legitimately describe the restored buffer", () => {
    const snapshot = `${ESC}[?6h${ESC}[?45h${ESC}[?7l${ESC}[4h`;
    expect(stripInputReportingModes(snapshot)).toBe(snapshot);
  });

  it("keeps mode resets, which are already the safe direction", () => {
    const snapshot = `${ESC}[?1004l${ESC}[?1000l`;
    expect(stripInputReportingModes(snapshot)).toBe(snapshot);
  });

  it("strips only the offending params from a combined set", () => {
    expect(stripInputReportingModes(`${ESC}[?1000;1006;45h`)).toBe(
      `${ESC}[?45h`,
    );
  });

  it("does not confuse a mode whose digits prefix another", () => {
    // 100 is not in the strip set even though 1000 and 1004 are.
    expect(stripInputReportingModes(`${ESC}[?100h`)).toBe(`${ESC}[?100h`);
  });

  it("preserves ordinary terminal content and SGR styling", () => {
    const snapshot = `${ESC}[1;32mraja@host${ESC}[0m:~$ ${ESC}[?1004h`;
    expect(stripInputReportingModes(snapshot)).toBe(
      `${ESC}[1;32mraja@host${ESC}[0m:~$ `,
    );
  });

  it("leaves a snapshot with no private modes untouched", () => {
    expect(stripInputReportingModes("plain output\r\n")).toBe(
      "plain output\r\n",
    );
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
    const clean = stripInputReportingModes(dropAlternateScreen(snapshot));
    expect(clean).toBe("out");
  });
});
