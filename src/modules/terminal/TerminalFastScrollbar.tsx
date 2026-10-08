import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown01Icon,
  Copy01Icon,
  Download01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  lineFromThumbTop,
  markerTop,
  sameScrollPaint,
  scrollPaint,
  type TerminalScrollState,
  thumbMetrics,
} from "./lib/fastScroll";
import { writeTerminalClipboard } from "./lib/terminalClipboard";

export type ScrollMarker = { line: number; failed: boolean; label: string };

const NO_MARKERS: ScrollMarker[] = [];

type View = { state: TerminalScrollState; marks: ScrollMarker[] };

function sameMarkerPaint(a: View, b: View, trackHeight: number): boolean {
  if (a.marks.length !== b.marks.length) return false;
  for (let i = 0; i < a.marks.length; i++) {
    const x = a.marks[i];
    const y = b.marks[i];
    if (x.failed !== y.failed || x.label !== y.label) return false;
    if (
      markerTop(x.line, a.state.totalLines, trackHeight) !==
      markerTop(y.line, b.state.totalLines, trackHeight)
    )
      return false;
  }
  return true;
}

type Props = {
  controlId: string;
  mode: "auto" | "always" | "hidden";
  active: boolean;
  getState: () => TerminalScrollState;
  subscribe: (notify: () => void) => () => void;
  scrollToLine: (line: number) => void;
  readTerminal: (
    scope?: "all" | "viewport" | "last200" | "selection" | "block",
  ) => string | null;
  markers?: () => ScrollMarker[];
};

async function copyText(text: string | null, label: string) {
  if (!text) return toast.info("Nothing to copy");
  if (await writeTerminalClipboard(text)) {
    toast.success(`${label} copied · ${text.split("\n").length} lines`);
  } else {
    toast.error("Clipboard access was denied");
  }
}

function saveTranscript(text: string | null) {
  if (!text) return toast.info("Nothing to export");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `terminal-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Terminal transcript download started");
}

export function TerminalFastScrollbar({
  controlId,
  mode,
  active,
  getState,
  subscribe,
  scrollToLine,
  readTerminal,
  markers,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => ({
    state: getState(),
    marks: markers?.() ?? NO_MARKERS,
  }));
  const { state, marks } = view;
  const paintedRef = useRef(view);
  const [trackHeight, setTrackHeight] = useState(0);
  const trackHeightRef = useRef(0);
  const trackObserver = useRef<ResizeObserver | null>(null);
  const live = active && mode !== "hidden";

  useEffect(() => {
    if (!live) return;
    // Fires on every parsed write. Read once per frame and only hand React a
    // new view when a painted pixel would move.
    let raf: number | null = null;
    const read = () => {
      raf = null;
      const next: View = {
        state: getState(),
        marks: markers?.() ?? NO_MARKERS,
      };
      const prev = paintedRef.current;
      const height = trackHeightRef.current;
      if (
        sameScrollPaint(
          scrollPaint(prev.state, height),
          scrollPaint(next.state, height),
        ) &&
        sameMarkerPaint(prev, next, height)
      )
        return;
      paintedRef.current = next;
      setView(next);
    };
    const schedule = () => {
      if (raf === null) raf = requestAnimationFrame(read);
    };
    read();
    const unsubscribe = subscribe(schedule);
    return () => {
      unsubscribe();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [live, getState, subscribe, markers]);

  // Measured, not read during render: writes no longer force a re-render, so
  // nothing else would pick up the height once the track mounts or resizes.
  const attachTrack = useCallback(
    (track: HTMLDivElement | null) => {
      trackRef.current = track;
      trackObserver.current?.disconnect();
      trackObserver.current = null;
      if (!track) return;
      const measure = () => {
        trackHeightRef.current = track.clientHeight;
        setTrackHeight(track.clientHeight);
        const next: View = {
          state: getState(),
          marks: markers?.() ?? NO_MARKERS,
        };
        paintedRef.current = next;
        setView(next);
      };
      measure();
      if (typeof ResizeObserver === "undefined") return;
      trackObserver.current = new ResizeObserver(measure);
      trackObserver.current.observe(track);
    },
    [getState, markers],
  );

  const metrics = thumbMetrics(state, trackHeight);
  const maxLine = Math.max(0, state.totalLines - state.viewportLines);
  const behind = Math.max(0, maxLine - state.line);
  const scrollable = maxLine > 0;

  // The rendered view lags a tail-following buffer on purpose, so every
  // interaction resolves against the live terminal state.
  const liveMaxLine = (now: TerminalScrollState) =>
    Math.max(0, now.totalLines - now.viewportLines);

  const move = (clientY: number, grabOffset: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const now = getState();
    scrollToLine(
      lineFromThumbTop(
        clientY - rect.top - grabOffset,
        thumbMetrics(now, rect.height).maxTop,
        now,
      ),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const now = getState();
    const end = liveMaxLine(now);
    const page = Math.max(1, now.viewportLines - 1);
    const destinations: Record<string, number> = {
      ArrowUp: now.line - 1,
      ArrowDown: now.line + 1,
      PageUp: now.line - page,
      PageDown: now.line + page,
      Home: 0,
      End: end,
    };
    const next = destinations[event.key];
    if (next === undefined) return;
    event.preventDefault();
    scrollToLine(Math.max(0, Math.min(end, next)));
  };

  if (mode === "hidden") return null;

  return (
    <aside
      className="terminal-quick-tools"
      data-mode={mode}
      aria-label="Terminal quick tools"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="terminal-copy-all"
            title="Copy or export terminal"
            aria-label="Copy or export terminal"
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              size={14}
              strokeWidth={1.8}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem
            onSelect={() =>
              void copyText(readTerminal("selection"), "Selection")
            }
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} /> Copy selection
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void copyText(readTerminal("block"), "Current block output")
            }
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} /> Copy current block
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void copyText(readTerminal("viewport"), "Visible terminal")
            }
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} /> Copy visible viewport
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void copyText(readTerminal("last200"), "Recent terminal output")
            }
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} /> Copy last 200 lines
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void copyText(readTerminal("all"), "Full terminal")}
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} /> Copy full scrollback
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => saveTranscript(readTerminal("all"))}
          >
            <HugeiconsIcon icon={Download01Icon} size={13} /> Export transcript…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        ref={attachTrack}
        className="terminal-fast-track"
        data-scrollable={scrollable}
        role="scrollbar"
        tabIndex={scrollable ? 0 : -1}
        aria-label="Terminal scrollback"
        aria-controls={controlId}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={maxLine}
        aria-valuenow={Math.min(state.line, maxLine)}
        title="Drag to fast scroll"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          move(event.clientY, metrics.height / 2);
        }}
      >
        {marks.map((marker) => (
          <button
            type="button"
            key={`${marker.line}:${marker.label}`}
            className="terminal-scroll-marker"
            data-failed={marker.failed}
            style={{
              top: markerTop(marker.line, state.totalLines, trackHeight),
            }}
            title={marker.label}
            aria-label={`Jump to ${marker.label}`}
            onClick={(event) => {
              event.stopPropagation();
              scrollToLine(marker.line);
            }}
          />
        ))}
        {scrollable && trackHeight > 0 && (
          <div
            className="terminal-fast-thumb"
            style={{
              height: metrics.height,
              transform: `translateY(${metrics.top}px)`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const grabOffset =
                event.clientY - event.currentTarget.getBoundingClientRect().top;
              const onMove = (e: PointerEvent) => move(e.clientY, grabOffset);
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp, { once: true });
            }}
          />
        )}
      </div>
      {behind > 1 && (
        <button
          type="button"
          className="terminal-jump-live"
          title={`${behind} lines behind · Jump to latest`}
          onClick={() => scrollToLine(liveMaxLine(getState()))}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={13} />
          <span>{behind > 999 ? "999+" : behind}</span>
        </button>
      )}
    </aside>
  );
}
