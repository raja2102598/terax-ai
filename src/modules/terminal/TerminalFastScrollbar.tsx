import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  lineFromThumbTop,
  type TerminalScrollState,
  thumbMetrics,
} from "./lib/fastScroll";

type Props = {
  getState: () => TerminalScrollState;
  scrollToLine: (line: number) => void;
  readTerminal: () => string | null;
};

export function TerminalFastScrollbar({
  getState,
  scrollToLine,
  readTerminal,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(getState);

  useEffect(() => {
    let signature = "";
    const refresh = () => {
      const next = getState();
      const nextSignature = `${next.line}:${next.totalLines}:${next.viewportLines}`;
      if (nextSignature !== signature) {
        signature = nextSignature;
        setState(next);
      }
    };
    refresh();
    const id = window.setInterval(refresh, 80);
    return () => window.clearInterval(id);
  }, [getState]);

  const trackHeight = trackRef.current?.clientHeight ?? 0;
  const metrics = thumbMetrics(state, trackHeight);
  const scrollable = state.totalLines > state.viewportLines;

  const move = (clientY: number, grabOffset: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    scrollToLine(
      lineFromThumbTop(clientY - rect.top - grabOffset, metrics.maxTop, state),
    );
  };

  return (
    <aside className="terminal-quick-tools" aria-label="Terminal quick tools">
      <button
        type="button"
        className="terminal-copy-all"
        title="Copy full terminal"
        aria-label="Copy full terminal"
        onClick={() => {
          const text = readTerminal();
          if (!text) return;
          void navigator.clipboard.writeText(text).then(() => {
            toast.success("Full terminal copied");
          });
        }}
      >
        <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.8} />
      </button>
      <div
        ref={trackRef}
        className="terminal-fast-track"
        data-scrollable={scrollable}
        title="Drag to fast scroll"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          move(event.clientY, metrics.height / 2);
        }}
      >
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
              const rect = event.currentTarget.getBoundingClientRect();
              const grabOffset = event.clientY - rect.top;
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
    </aside>
  );
}
