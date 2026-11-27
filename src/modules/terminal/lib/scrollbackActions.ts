import { ghosttyBlocks } from "@/modules/terminal/ghostty/ghosttyBlockSessions";
import { ghosttyModelForLeaf } from "@/modules/terminal/ghostty/useGhosttyTerminalSession";
import { writeTerminalClipboard } from "@/modules/terminal/lib/terminalClipboard";

export type TerminalCopyResult = "copied" | "empty" | "failed";

type ScrollModel = {
  scrollPosition(): { readonly offset: number; readonly history: number };
  scrollTo(offset: number): boolean;
};

/** Offset is measured in lines above the live bottom, so the top is `history`. */
export function scrollModelToTop(model: ScrollModel): boolean {
  return model.scrollTo(model.scrollPosition().history);
}

export async function copyTerminalText(
  text: string | null,
  write: (text: string) => Promise<void> = writeTerminalClipboard,
): Promise<TerminalCopyResult> {
  if (!text) return "empty";
  try {
    await write(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function scrollLeafToTop(leafId: number): boolean {
  const model = ghosttyModelForLeaf(leafId);
  return model ? scrollModelToTop(model) : false;
}

export function scrollLeafToBottom(leafId: number): boolean {
  return ghosttyModelForLeaf(leafId)?.scrollToBottom() ?? false;
}

export function copyLeafScrollback(
  leafId: number,
): Promise<TerminalCopyResult> {
  return copyTerminalText(
    ghosttyModelForLeaf(leafId)?.readText(Number.MAX_SAFE_INTEGER) ?? null,
  );
}

export function copyLeafCurrentBlock(
  leafId: number,
): Promise<TerminalCopyResult> {
  const controller = ghosttyBlocks(leafId)?.controller;
  const id = controller?.currentBlockId() ?? null;
  return copyTerminalText(
    id === null ? null : (controller?.readById(id)?.output ?? null),
  );
}

export function selectLeafCurrentBlock(leafId: number): boolean {
  const controller = ghosttyBlocks(leafId)?.controller;
  const id = controller?.currentBlockId() ?? null;
  return id !== null && (controller?.selectById(id) ?? false);
}
