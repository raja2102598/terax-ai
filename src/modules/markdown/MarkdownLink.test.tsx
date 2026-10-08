import { openExternalUrl } from "@/lib/external-link";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: { url: string }) =>
    command === "open_external_url"
      ? openUrl(args.url)
      : Promise.reject(new Error(`unexpected command ${command}`)),
}));

describe("MarkdownLink", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "https://chatgpt.com/codex/settings/usage",
    "mailto:support@example.com",
    "tel:+16045550123",
  ])("opens supported links natively: %s", async (href) => {
    openUrl.mockResolvedValue(undefined);
    const onSettled = vi.fn();

    await openExternalUrl(href, onSettled);

    expect(openUrl).toHaveBeenCalledWith(href);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("still settles when opening fails", async () => {
    openUrl.mockRejectedValue(new Error("browser unavailable"));
    const onSettled = vi.fn();

    await openExternalUrl("https://example.com", onSettled);

    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("does not invoke the native opener for unsupported schemes", async () => {
    const onSettled = vi.fn();

    await openExternalUrl("javascript:alert(1)", onSettled);

    expect(openUrl).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledOnce();
  });
});
