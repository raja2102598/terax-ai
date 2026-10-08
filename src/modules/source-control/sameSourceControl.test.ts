import { describe, expect, it } from "vitest";
import type {
  GitChangedFile,
  GitRepoInfo,
  GitStatusSnapshot,
} from "@/modules/ai/lib/native";
import {
  keepIfUnchanged,
  sameGitRepoInfo,
  sameGitStatusSnapshot,
} from "./sameSourceControl";

const repo: GitRepoInfo = {
  repoRoot: "/repo",
  branch: "main",
  upstream: "origin/main",
  isDetached: false,
};

function file(overrides: Partial<GitChangedFile> = {}): GitChangedFile {
  return {
    path: "src/a.ts",
    originalPath: null,
    indexStatus: " ",
    worktreeStatus: "M",
    staged: false,
    unstaged: true,
    untracked: false,
    statusLabel: "Modified",
    ...overrides,
  };
}

function status(overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [file()],
    ...overrides,
  };
}

describe("sameGitRepoInfo", () => {
  it("treats field-equal repos as the same", () => {
    expect(sameGitRepoInfo(repo, { ...repo })).toBe(true);
  });

  it("detects a changed branch", () => {
    expect(sameGitRepoInfo(repo, { ...repo, branch: "dev" })).toBe(false);
  });

  it("detects a changed upstream and detached flag", () => {
    expect(sameGitRepoInfo(repo, { ...repo, upstream: null })).toBe(false);
    expect(sameGitRepoInfo(repo, { ...repo, isDetached: true })).toBe(false);
  });

  it("handles null on either side", () => {
    expect(sameGitRepoInfo(null, null)).toBe(true);
    expect(sameGitRepoInfo(repo, null)).toBe(false);
    expect(sameGitRepoInfo(null, repo)).toBe(false);
  });
});

describe("sameGitStatusSnapshot", () => {
  it("treats field-equal snapshots as the same", () => {
    expect(sameGitStatusSnapshot(status(), status())).toBe(true);
  });

  it("detects a changed branch", () => {
    expect(sameGitStatusSnapshot(status(), status({ branch: "dev" }))).toBe(
      false,
    );
  });

  it("detects a changed file status code", () => {
    const next = status({
      changedFiles: [file({ worktreeStatus: "D", statusLabel: "Deleted" })],
    });
    expect(sameGitStatusSnapshot(status(), next)).toBe(false);
  });

  it("detects a change in staged/unstaged flags", () => {
    const next = status({
      changedFiles: [file({ staged: true, unstaged: false })],
    });
    expect(sameGitStatusSnapshot(status(), next)).toBe(false);
  });

  it("detects an added file", () => {
    const next = status({
      changedFiles: [file(), file({ path: "src/b.ts" })],
    });
    expect(sameGitStatusSnapshot(status(), next)).toBe(false);
  });

  it("detects a removed file", () => {
    const current = status({
      changedFiles: [file(), file({ path: "src/b.ts" })],
    });
    expect(sameGitStatusSnapshot(current, status())).toBe(false);
  });

  it("treats reordered changed files as different", () => {
    const a = file({ path: "src/a.ts" });
    const b = file({ path: "src/b.ts" });
    expect(
      sameGitStatusSnapshot(
        status({ changedFiles: [a, b] }),
        status({ changedFiles: [b, a] }),
      ),
    ).toBe(false);
  });

  it("detects a changed truncated flag and ahead/behind counts", () => {
    expect(sameGitStatusSnapshot(status(), status({ truncated: true }))).toBe(
      false,
    );
    expect(sameGitStatusSnapshot(status(), status({ ahead: 1 }))).toBe(false);
    expect(sameGitStatusSnapshot(status(), status({ behind: 1 }))).toBe(false);
  });

  it("handles empty repos and null values", () => {
    const empty = status({ changedFiles: [] });
    expect(sameGitStatusSnapshot(empty, status({ changedFiles: [] }))).toBe(
      true,
    );
    expect(sameGitStatusSnapshot(null, null)).toBe(true);
    expect(sameGitStatusSnapshot(empty, null)).toBe(false);
    expect(sameGitStatusSnapshot(null, empty)).toBe(false);
  });
});

describe("keepIfUnchanged", () => {
  it("returns the current object when every field is identical", () => {
    const current = { a: 1, b: null as string | null };
    expect(keepIfUnchanged(current, { ...current })).toBe(current);
  });

  it("returns the next object when any field changed", () => {
    const current = { a: 1, b: null as string | null };
    const next = { ...current, b: "x" };
    expect(keepIfUnchanged(current, next)).toBe(next);
  });
});
