import { invoke } from "@tauri-apps/api/core";

// Routed through our own command: the opener plugin leaves one unreaped child
// process behind for every link it opens.
export function openUrl(href: string): Promise<void> {
  return invoke<void>("open_external_url", { url: href });
}

export function isExternalUrl(href: string): boolean {
  return /^(?:https?:|mailto:|tel:)/i.test(href);
}

export function openExternalUrl(
  href: string,
  onSettled?: () => void,
): Promise<void> {
  if (!isExternalUrl(href)) {
    onSettled?.();
    return Promise.resolve();
  }

  return openUrl(href)
    .catch((error) => {
      console.error("[terax] failed to open external link:", error);
    })
    .finally(() => onSettled?.());
}
