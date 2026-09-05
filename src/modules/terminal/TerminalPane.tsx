import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTheme } from "@/modules/theme";
import type { SearchAddon } from "@xterm/addon-search";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { BlockOverlay } from "./block/BlockOverlay";
import { BlockWatermark } from "./block/BlockWatermark";
import {
  focusLeafInput,
  submitToLeaf,
  useTerminalSession,
} from "./lib/useTerminalSession";
import { TerminalFastScrollbar } from "./TerminalFastScrollbar";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
  copyFull: () => Promise<boolean>;
  copyCurrentBlock: () => Promise<boolean>;
  selectCurrentBlock: () => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
};

type Props = {
  /** Stable identifier for this leaf (passed back through callbacks). */
  leafId: number;
  /** Tab containing this pane is on screen. */
  visible: boolean;
  /** This leaf is the active pane within its tab — receives auto-focus. */
  focused?: boolean;
  initialCwd?: string;
  /** Enable command-block decorations (OSC 133) for this terminal. */
  blocks?: boolean;
  onSearchReady?: (leafId: number, addon: SearchAddon) => void;
  onExit?: (leafId: number, code: number) => void;
  onCwd?: (leafId: number, cwd: string) => void;
};

export const TerminalPane = memo(
  forwardRef<TerminalPaneHandle, Props>(function TerminalPane(
    {
      leafId,
      visible,
      focused = true,
      initialCwd,
      blocks = false,
      onSearchReady,
      onExit,
      onCwd,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const downYRef = useRef<number | null>(null);
    const { resolvedMode, activeTheme } = useTheme();
    const scrollbarMode = usePreferencesStore((s) => s.terminalScrollbarMode);
    const showBlockMarkers = usePreferencesStore(
      (s) => s.terminalShowBlockMarkers,
    );

    const session = useTerminalSession({
      leafId,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      blocks,
      onSearchReady: (a) => onSearchReady?.(leafId, a),
      onExit: (c) => onExit?.(leafId, c),
      onCwd: (c) => onCwd?.(leafId, c),
    });

    useEffect(() => {
      // Defer one frame so CSS-variable token resolution sees the new class.
      const id = requestAnimationFrame(() => session.applyTheme());
      return () => cancelAnimationFrame(id);
    }, [resolvedMode, activeTheme, session]);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => session.write(data),
        focus: () => session.focus(),
        getBuffer: (max?: number) => session.getBuffer(max),
        getSelection: () => session.getSelection(),
        copyFull: () => session.copyFull(),
        copyCurrentBlock: () => session.copyCurrentBlock(),
        selectCurrentBlock: () => session.selectCurrentBlock(),
        scrollToTop: () => session.scrollToLine(0),
        scrollToBottom: () => session.scrollToBottom(),
      }),
      [session],
    );

    const hideStyle = {
      visibility: visible ? ("visible" as const) : ("hidden" as const),
      pointerEvents: visible ? ("auto" as const) : ("none" as const),
    };

    const promptReady = session.blockMode === "prompt";

    const quickTools = (
      <TerminalFastScrollbar
        controlId={`terminal-${leafId}`}
        mode={scrollbarMode}
        getState={session.getScrollState}
        subscribe={session.subscribeScroll}
        scrollToLine={session.scrollToLine}
        readTerminal={(scope) =>
          scope === "viewport"
            ? session.getViewport()
            : scope === "selection"
              ? session.getSelection()
              : scope === "block"
                ? session.getCurrentBlock()
                : session.getBuffer(
                    scope === "last200" ? 200 : Number.MAX_SAFE_INTEGER,
                  )
        }
        markers={blocks && showBlockMarkers ? session.scrollMarkers : undefined}
      />
    );

    if (blocks) {
      return (
        <div
          className="zoom-exempt flex h-full w-full flex-col"
          style={hideStyle}
        >
          <div className="relative min-h-0 flex-1">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: terminal surface; pointer selects command blocks */}
            <div
              ref={containerRef}
              id={`terminal-${leafId}`}
              className="absolute inset-0 z-0"
              onMouseDown={(e) => {
                downYRef.current = e.clientY;
              }}
              onMouseUp={(e) => {
                const moved =
                  downYRef.current != null &&
                  Math.abs(e.clientY - downYRef.current) > 4;
                downYRef.current = null;
                if (!moved) session.selectBlockAt(e.clientY);
                if (session.blockMode === "prompt") focusLeafInput(leafId);
              }}
            />
            <BlockWatermark
              leafId={leafId}
              subscribe={session.subscribeBlocks}
            />
            <BlockOverlay
              subscribe={session.subscribeBlocks}
              getVisible={session.visibleBlocks}
              readOutput={(id) => session.readBlockId(id)?.output ?? null}
              selectBlock={session.selectBlock}
              searchBlock={session.searchBlock}
              revealMatch={session.revealMatch}
              clearSearch={session.clearSearch}
              promptReady={promptReady}
              onRunAgain={(cmd) => submitToLeaf(leafId, cmd)}
              onRestoreFocus={() => {
                if (session.blockMode === "prompt") focusLeafInput(leafId);
              }}
            />
            {quickTools}
          </div>
        </div>
      );
    }

    return (
      <div className="zoom-exempt relative h-full w-full" style={hideStyle}>
        <div
          id={`terminal-${leafId}`}
          ref={containerRef}
          className="absolute inset-0"
        />
        {quickTools}
      </div>
    );
  }),
);
