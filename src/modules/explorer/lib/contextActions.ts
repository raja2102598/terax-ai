import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Best-effort; ignore in environments without clipboard permission.
  }
}

export function relativePath(rootPath: string, path: string): string {
  if (path === rootPath) return ".";
  if (path.startsWith(`${rootPath}/`)) return path.slice(rootPath.length + 1);
  return path;
}

export async function revealInFinder(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (e) {
    console.error("revealItemInDir failed:", e);
  }
}

export function isExtractableArchive(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".zip") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz")
  );
}

export async function extractArchive(path: string): Promise<void> {
  await invoke("fs_extract", { path, workspace: currentWorkspaceEnv() });
}
