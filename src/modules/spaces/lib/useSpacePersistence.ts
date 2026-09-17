import { useCallback, useEffect, useRef } from "react";
import type { Tab } from "@/modules/tabs";
import { isSerializableTab, serializeTabs } from "./serialize";
import { saveState } from "./store";
import { useSpaces } from "./useSpaces";
import {
  forEachSlot,
  serializeSlot,
} from "@/modules/terminal/lib/rendererPool";
import {
  deleteSnapshot,
  putSnapshot,
} from "@/modules/terminal/lib/snapshotStore";
import { setPrivateLeaves } from "@/modules/terminal/lib/useTerminalSession";
import { leafIds } from "@/modules/terminal/lib/panes";

const DEBOUNCE_MS = 3000;

type Snapshot = { tabs: Tab[]; activeId: number; activeSpaceId: string };

type Params = Snapshot & {
  /** Gate writes until boot hydration finished, so restore never round-trips. */
  enabled: boolean;
};

type LastWrite = { json: string; activeTabIndex: number };

export function useSpacePersistence({
  tabs,
  activeId,
  activeSpaceId,
  enabled,
}: Params) {
  const last = useRef<Map<string, LastWrite>>(new Map());
  /**
   * Spaces observed holding at least one tab. A space only needs clearing once
   * it has actually held something; keying off `last.json` instead would miss
   * a space emptied before its first flush, since boot seeds those with "".
   */
  const everHadTabs = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Snapshot>({ tabs, activeId, activeSpaceId });
  latest.current = { tabs, activeId, activeSpaceId };

  // Seed each space's last-known active index from disk so the first flush
  // preserves it for spaces the user never opens (empty json forces one write
  // with the correct index rather than clobbering it to 0).
  if (enabled && !seeded.current) {
    seeded.current = true;
    for (const [id, idx] of Object.entries(
      useSpaces.getState().initialActiveIndex,
    )) {
      last.current.set(id, { json: "", activeTabIndex: idx });
    }
    // Restored tabs are already in hand here, so a space emptied inside the
    // first debounce window is still known to have held something.
    for (const t of tabs) everHadTabs.current.add(t.spaceId);
  }

  const flush = useCallback((snap: Snapshot) => {
    // A private terminal is excluded from saved tabs, so its buffer must not be
    // written either -- persisting it both leaks the contents to disk and
    // strands a snapshot under a leaf id no saved tab claims, which a later
    // pane can then allocate and display.
    const privateLeaves = new Set<number>();
    for (const t of snap.tabs) {
      if (t.kind === "terminal" && t.private) {
        for (const id of leafIds(t.paneTree)) privateLeaves.add(id);
      }
    }

    forEachSlot((slot) => {
      const leafId = slot.currentLeafId ?? slot.retainedLeafId;
      if (leafId === null) return;
      if (privateLeaves.has(leafId)) {
        void deleteSnapshot(leafId);
        return;
      }
      void putSnapshot(leafId, serializeSlot(slot));
    });

    const groups = new Map<string, Tab[]>();
    for (const t of snap.tabs) {
      const arr = groups.get(t.spaceId);
      if (arr) arr.push(t);
      else groups.set(t.spaceId, [t]);
    }

    for (const spaceId of groups.keys()) everHadTabs.current.add(spaceId);

    // A space whose last tab was moved out produces no group here, so its old
    // state would stay on disk claiming leaf ids the destination space now
    // claims too -- and leaf ids key sessions and renderer slots. Re-save it as
    // empty. Only spaces seen holding tabs are cleared, so one the user never
    // opened is left alone.
    for (const spaceId of everHadTabs.current) {
      if (!groups.has(spaceId)) groups.set(spaceId, []);
    }

    for (const [spaceId, group] of groups) {
      const serialized = serializeTabs(group);
      const prev = last.current.get(spaceId);
      let activeTabIndex = prev?.activeTabIndex ?? 0;
      if (spaceId === snap.activeSpaceId) {
        const idx = group
          .filter(isSerializableTab)
          .findIndex((t) => t.id === snap.activeId);
        if (idx >= 0) activeTabIndex = idx;
      }
      const json = JSON.stringify(serialized);
      if (
        prev &&
        prev.json === json &&
        prev.activeTabIndex === activeTabIndex
      ) {
        continue;
      }
      last.current.set(spaceId, { json, activeTabIndex });
      void saveState(spaceId, { tabs: serialized, activeTabIndex });
    }
  }, []);

  // Synced on every tabs change, not on the debounced flush: the renderer pool
  // writes snapshots whenever it steals or reaps a slot, which can happen long
  // before the next flush. Tracking always runs so those writes are blocked
  // from the first render, but deletion waits for boot -- see setPrivateLeaves.
  useEffect(() => {
    const ids: number[] = [];
    for (const t of tabs) {
      if (t.kind === "terminal" && t.private) ids.push(...leafIds(t.paneTree));
    }
    setPrivateLeaves(ids, enabled);
  }, [tabs, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const snap: Snapshot = { tabs, activeId, activeSpaceId };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      flush(snap);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tabs, activeId, activeSpaceId, enabled, flush]);

  useEffect(() => {
    if (!enabled) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush(latest.current);
    };
    const onLeave = () => flush(latest.current);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      flush(latest.current);
    };
  }, [enabled, flush]);
}
