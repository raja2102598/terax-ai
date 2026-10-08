import { afterEach, describe, expect, it, vi } from "vitest";

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: { url: string }) =>
    command === "open_external_url"
      ? openUrl(args.url)
      : Promise.reject(new Error(`unexpected command ${command}`)),
}));

import { createTerminalLinkHandler } from "./terminalLinks";

describe("createTerminalLinkHandler", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens OSC 8 links natively and restores late-bound terminal focus", async () => {
    openUrl.mockResolvedValue(undefined);
    const initialFocus = vi.fn();
    let focus = initialFocus;
    const handler = createTerminalLinkHandler(() => focus());
    focus = vi.fn();

    handler.activate(
      {} as MouseEvent,
      "https://chatgpt.com/codex/settings/usage",
    );

    expect(openUrl).toHaveBeenCalledWith(
      "https://chatgpt.com/codex/settings/usage",
    );
    await vi.waitFor(() => expect(focus).toHaveBeenCalledOnce());
    expect(initialFocus).not.toHaveBeenCalled();
  });
});
