import type {
  GitChangedFile,
  GitRepoInfo,
  GitStatusSnapshot,
} from "@/modules/ai/lib/native";

export function sameGitRepoInfo(
  a: GitRepoInfo | null,
  b: GitRepoInfo | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.repoRoot === b.repoRoot &&
    a.branch === b.branch &&
    a.upstream === b.upstream &&
    a.isDetached === b.isDetached
  );
}

function sameChangedFile(a: GitChangedFile, b: GitChangedFile): boolean {
  return (
    a.path === b.path &&
    a.originalPath === b.originalPath &&
    a.indexStatus === b.indexStatus &&
    a.worktreeStatus === b.worktreeStatus &&
    a.staged === b.staged &&
    a.unstaged === b.unstaged &&
    a.untracked === b.untracked &&
    a.statusLabel === b.statusLabel
  );
}

// Order is significant: the panel renders changedFiles in the order git reported them.
export function sameGitStatusSnapshot(
  a: GitStatusSnapshot | null,
  b: GitStatusSnapshot | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.repoRoot !== b.repoRoot ||
    a.branch !== b.branch ||
    a.upstream !== b.upstream ||
    a.ahead !== b.ahead ||
    a.behind !== b.behind ||
    a.isDetached !== b.isDetached ||
    a.truncated !== b.truncated ||
    a.changedFiles.length !== b.changedFiles.length
  ) {
    return false;
  }
  return a.changedFiles.every((file, index) =>
    sameChangedFile(file, b.changedFiles[index]),
  );
}

// Returns `current` when every field of `next` is identical, so React bails out.
export function keepIfUnchanged<T extends object>(current: T, next: T): T {
  const keys = Object.keys(next) as (keyof T)[];
  return keys.every((key) => Object.is(current[key], next[key]))
    ? current
    : next;
}
