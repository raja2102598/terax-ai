import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/terminal/ghostty/useGhosttyTerminalSession", () => ({
  ghosttyModelForLeaf: () => null,
}));
vi.mock("@/modules/terminal/ghostty/ghosttyBlockSessions", () => ({
  ghosttyBlocks: () => undefined,
}));
vi.mock("@/modules/terminal/lib/terminalClipboard", () => ({
  writeTerminalClipboard: vi.fn(),
}));

import {
  copyLeafScrollback,
  copyTerminalText,
  scrollLeafToTop,
  scrollModelToTop,
  selectLeafCurrentBlock,
} from "./scrollbackActions";

describe("scrollModelToTop", () => {
  it("scrolls by the whole history, which is the offset of the first line", () => {
    const scrollTo = vi.fn(() => true);
    const model = {
      scrollPosition: () => ({ offset: 3, history: 420 }),
      scrollTo,
    };
    expect(scrollModelToTop(model)).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(420);
  });
});

describe("copyTerminalText", () => {
  it("reports empty without touching the clipboard", async () => {
    const write = vi.fn();
    await expect(copyTerminalText("", write)).resolves.toBe("empty");
    await expect(copyTerminalText(null, write)).resolves.toBe("empty");
    expect(write).not.toHaveBeenCalled();
  });

  it("reports copied once the clipboard accepted the text", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    await expect(copyTerminalText("ls\n", write)).resolves.toBe("copied");
    expect(write).toHaveBeenCalledWith("ls\n");
  });

  it("reports failed when the clipboard refuses", async () => {
    const write = vi.fn().mockRejectedValue(new Error("denied"));
    await expect(copyTerminalText("ls", write)).resolves.toBe("failed");
  });
});

describe("leaf actions without a live session", () => {
  it("do nothing and say so", async () => {
    expect(scrollLeafToTop(7)).toBe(false);
    expect(selectLeafCurrentBlock(7)).toBe(false);
    await expect(copyLeafScrollback(7)).resolves.toBe("empty");
  });
});
