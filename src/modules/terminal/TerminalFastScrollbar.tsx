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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  lineFromThumbTop,
  type TerminalScrollState,
  thumbMetrics,
} from "./lib/fastScroll";

export type ScrollMarker = { line: number; failed: boolean; label: string };

type Props = {
  controlId: string;
  mode: "auto" | "always" | "hidden";
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
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied · ${text.split("\n").length} lines`);
  } catch {
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
  toast.success("Terminal transcript exported");
}

export function TerminalFastScrollbar({
  controlId,
  mode,
  getState,
  subscribe,
  scrollToLine,
  readTerminal,
  markers,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(getState);

  useEffect(() => {
    const refresh = () => setState(getState());
    refresh();
    return subscribe(refresh);
  }, [getState, subscribe]);

  const trackHeight = trackRef.current?.clientHeight ?? 0;
  const metrics = thumbMetrics(state, trackHeight);
  const maxLine = Math.max(0, state.totalLines - state.viewportLines);
  const behind = Math.max(0, maxLine - state.line);
  const scrollable = maxLine > 0;

  const move = (clientY: number, grabOffset: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    scrollToLine(
      lineFromThumbTop(clientY - rect.top - grabOffset, metrics.maxTop, state),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const page = Math.max(1, state.viewportLines - 1);
    const destinations: Record<string, number> = {
      ArrowUp: state.line - 1,
      ArrowDown: state.line + 1,
      PageUp: state.line - page,
      PageDown: state.line + page,
      Home: 0,
      End: maxLine,
    };
    const next = destinations[event.key];
    if (next === undefined) return;
    event.preventDefault();
    scrollToLine(Math.max(0, Math.min(maxLine, next)));
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
        ref={trackRef}
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
        {markers?.().map((marker) => (
          <button
            type="button"
            key={`${marker.line}:${marker.label}`}
            className="terminal-scroll-marker"
            data-failed={marker.failed}
            style={{
              top: `${(marker.line / Math.max(1, state.totalLines)) * 100}%`,
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
          onClick={() => scrollToLine(maxLine)}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={13} />
          <span>{behind > 999 ? "999+" : behind}</span>
        </button>
      )}
    </aside>
  );
}
