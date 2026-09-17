import { describe, expect, it } from "vitest";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import {
  hydrateTabs,
  maxSerializedLeafId,
  serializeTabs,
  type SerializedTab,
} from "./serialize";

function counter(start = 100): () => number {
  let n = start;
  return () => n++;
}

function leafIdsOf(node: PaneNode): number[] {
  return node.kind === "leaf" ? [node.id] : node.children.flatMap(leafIdsOf);
}

function term(over: Partial<Extract<Tab, { kind: "terminal" }>>): Tab {
  return {
    id: 1,
    kind: "terminal",
    spaceId: "s1",
    title: "shell",
    paneTree: { kind: "leaf", id: 2, cwd: "/a" },
    activeLeafId: 2,
    ...over,
  } as Tab;
}

describe("serializeTabs", () => {
  it("drops private terminals and transient kinds", () => {
    const tabs: Tab[] = [
      term({ id: 1 }),
      term({ id: 3, private: true }),
      {
        id: 5,
        kind: "git-diff",
        spaceId: "s1",
        title: "d",
        path: "/a/x",
        repoRoot: "/a",
        mode: "+",
        originalPath: null,
        preview: true,
      },
      {
        id: 7,
        kind: "editor",
        spaceId: "s1",
        title: "x",
        path: "/a/x.ts",
        dirty: false,
        preview: false,
      },
    ];
    const out = serializeTabs(tabs);
    expect(out.map((t) => t.kind)).toEqual(["terminal", "editor"]);
  });

  it("marks the active leaf in a split tree", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 10,
      dir: "row",
      children: [
        { kind: "leaf", id: 11, cwd: "/a" },
        { kind: "leaf", id: 12, cwd: "/b" },
      ],
    };
    const [s] = serializeTabs([term({ paneTree: tree, activeLeafId: 12 })]);
    const node = s as Extract<SerializedTab, { kind: "terminal" }>;
    expect(node.tree.kind).toBe("split");
    if (node.tree.kind === "split") {
      expect(node.tree.children[1]).toMatchObject({ cwd: "/b", active: true });
      expect(node.tree.children[0]).not.toHaveProperty("active");
    }
  });
});

describe("hydrateTabs", () => {
  it("round-trips structure, cwd, blocks and active leaf", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 10,
      dir: "col",
      children: [
        { kind: "leaf", id: 11, cwd: "/a" },
        { kind: "leaf", id: 12, cwd: "/b" },
      ],
    };
    const tabs: Tab[] = [
      term({
        paneTree: tree,
        activeLeafId: 12,
        blocks: true,
        customTitle: "x",
      }),
    ];
    const serialized = serializeTabs(tabs);
    const [restored] = hydrateTabs(serialized, "s2", counter());
    expect(restored.kind).toBe("terminal");
    if (restored.kind !== "terminal") return;

    expect(restored.spaceId).toBe("s2");
    expect(restored.cold).toBe(true);
    expect(restored.blocks).toBe(true);
    expect(restored.customTitle).toBe("x");
    expect(restored.paneTree.kind).toBe("split");

    const leaves = leafIdsOf(restored.paneTree);
    expect(new Set(leaves).size).toBe(2);
    expect(leaves).toContain(restored.activeLeafId);
    // active leaf was the second one, which carried /b
    expect(restored.cwd).toBe("/b");
  });

  it("keeps leaf ids stable across a save/restore round trip", () => {
    // Terminal snapshots are persisted keyed by leaf id, so a restored pane
    // must come back under the same id or it adopts another pane's buffer.
    const tree: PaneNode = {
      kind: "split",
      id: 10,
      dir: "row",
      children: [
        { kind: "leaf", id: 11, cwd: "/a" },
        { kind: "leaf", id: 12, cwd: "/b" },
      ],
    };
    const serialized = serializeTabs([
      term({ id: 1, paneTree: tree, activeLeafId: 11 }),
    ]);
    const [restored] = hydrateTabs(serialized, "s1", counter(100));
    if (restored.kind !== "terminal") throw new Error("expected terminal tab");

    expect(leafIdsOf(restored.paneTree)).toEqual([11, 12]);
    expect(restored.activeLeafId).toBe(11);
  });

  it("allocates fresh ids for leaves saved before ids were persisted", () => {
    // Legacy state on disk has no `id` on its leaves; those must still hydrate.
    const serialized: SerializedTab[] = [
      { kind: "terminal", tree: { kind: "leaf", cwd: "/a", active: true } },
    ];
    const [restored] = hydrateTabs(serialized, "s1", counter(100));
    if (restored.kind !== "terminal") throw new Error("expected terminal tab");

    expect(leafIdsOf(restored.paneTree)).toEqual([100]);
    expect(restored.activeLeafId).toBe(100);
  });

  it("allocates fresh, unique, monotonic ids for everything not persisted", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 10,
      dir: "row",
      children: [
        { kind: "leaf", id: 11, cwd: "/a" },
        { kind: "leaf", id: 12, cwd: "/b" },
      ],
    };
    const serialized = serializeTabs([
      term({ id: 1, paneTree: tree, activeLeafId: 11 }),
      term({ id: 2 }),
    ]);
    const restored = hydrateTabs(serialized, "s1", counter(100));

    const ids: number[] = [];
    for (const t of restored) {
      ids.push(t.id);
      if (t.kind === "terminal") ids.push(...leafIdsOf(t.paneTree));
    }
    expect(new Set(ids).size).toBe(ids.length);
    // Tab ids and split ids are never persisted, so they are always fresh.
    const tabIds = restored.map((t) => t.id);
    expect(Math.min(...tabIds)).toBeGreaterThanOrEqual(100);
  });

  it("never hands two leaves the same id, even when disk state repeats one", () => {
    // A space emptied by moving its last tab out is never re-saved, so its
    // stale state keeps a leaf the target space now also claims. Sessions and
    // renderer slots are keyed solely by leaf id, so a duplicate would make two
    // panes share one pty.
    const claimed = new Set<number>();
    const alloc = counter(100);
    const stale: SerializedTab[] = [
      { kind: "terminal", tree: { kind: "leaf", id: 7, cwd: "/a" } },
    ];
    const moved: SerializedTab[] = [
      { kind: "terminal", tree: { kind: "leaf", id: 7, cwd: "/a" } },
    ];

    const a = hydrateTabs(stale, "s1", alloc, claimed);
    const b = hydrateTabs(moved, "s2", alloc, claimed);
    const ids = [...a, ...b].flatMap((t) =>
      t.kind === "terminal" ? leafIdsOf(t.paneTree) : [],
    );

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(7);
  });

  it("deduplicates a repeated id inside a single tree", () => {
    const serialized: SerializedTab[] = [
      {
        kind: "terminal",
        tree: {
          kind: "split",
          dir: "row",
          children: [
            { kind: "leaf", id: 5 },
            { kind: "leaf", id: 5 },
          ],
        },
      },
    ];
    const [restored] = hydrateTabs(serialized, "s1", counter(100));
    if (restored.kind !== "terminal") throw new Error("expected terminal tab");
    const ids = leafIdsOf(restored.paneTree);
    expect(new Set(ids).size).toBe(2);
  });

  it("returns empty for corrupted input without throwing", () => {
    expect(hydrateTabs([] as SerializedTab[], "s1", counter())).toEqual([]);
    expect(
      hydrateTabs(null as unknown as SerializedTab[], "s1", counter()),
    ).toEqual([]);
  });

  it("hydrates editor/preview/markdown as cold with derived titles", () => {
    const serialized: SerializedTab[] = [
      { kind: "editor", path: "/a/foo.ts" },
      { kind: "preview", url: "http://localhost:5173/x" },
      { kind: "markdown", path: "/a/README.md" },
    ];
    const out = hydrateTabs(serialized, "s1", counter());
    expect(out.every((t) => t.cold === true)).toBe(true);
    expect(out.map((t) => t.title)).toEqual([
      "foo.ts",
      "localhost:5173",
      "README.md",
    ]);
  });
});

describe("maxSerializedLeafId", () => {
  it("finds the highest persisted leaf id across tabs and splits", () => {
    const serialized: SerializedTab[] = [
      { kind: "terminal", tree: { kind: "leaf", id: 4 } },
      {
        kind: "terminal",
        tree: {
          kind: "split",
          dir: "row",
          children: [
            { kind: "leaf", id: 9 },
            { kind: "leaf", id: 31 },
          ],
        },
      },
    ];
    expect(maxSerializedLeafId(serialized)).toBe(31);
  });

  it("returns 0 for legacy leaves that carry no id", () => {
    expect(
      maxSerializedLeafId([{ kind: "terminal", tree: { kind: "leaf" } }]),
    ).toBe(0);
  });

  it("ignores non-terminal tabs", () => {
    expect(maxSerializedLeafId([{ kind: "editor", path: "/a.ts" }])).toBe(0);
  });

  it("returns 0 for corrupted input without throwing", () => {
    expect(maxSerializedLeafId([])).toBe(0);
    expect(maxSerializedLeafId(null as unknown as SerializedTab[])).toBe(0);
  });
});
