// DEC private modes that describe how the *attached program* wants its input
// delivered, rather than anything about the screen contents.
//
// SerializeAddon faithfully re-emits whatever modes were live when a slot was
// serialized, which is right for the visible buffer and wrong for these: a
// restored snapshot is replayed into a brand-new pty running a plain shell that
// never asked for any of them. Focus reporting (1004) is the one that bites --
// xterm then sends ESC[I / ESC[O on every focus change and the shell, which has
// no idea what those are, echoes them into the prompt as ^[[I / ^[[O.
//
// The same reasoning covers the rest: mouse tracking would spray escape
// sequences on click, bracketed paste would wrap pastes the shell does not
// expect, and application cursor keys would break the arrow keys outright.
const INPUT_REPORTING_MODES = new Set([
  1, // DECCKM - application cursor keys
  9, // X10 mouse reporting
  1000, // VT200 mouse reporting
  1002, // button-event mouse tracking
  1003, // any-event mouse tracking
  1004, // focus reporting  <- the ^[[I / ^[[O leak
  1005, // UTF-8 mouse encoding
  1006, // SGR mouse encoding
  1015, // urxvt mouse encoding
  1016, // SGR-pixel mouse encoding
  2004, // bracketed paste
]);

// CSI ? Pm [;Pm ...] h  -- a DEC private mode *set*. Resets (`l`) are left
// alone; they already move toward the default we want.
const DEC_PRIVATE_SET = /\x1b\[\?([\d;]*)h/g;

/**
 * Remove input-reporting mode sets from a serialized terminal snapshot, so
 * replaying it cannot enable reporting behind the back of the fresh shell that
 * is about to own the pty. Rendering modes and all ordinary content, including
 * SGR styling, are preserved untouched.
 */
export function stripInputReportingModes(snapshot: string): string {
  return snapshot.replace(DEC_PRIVATE_SET, (match, params: string) => {
    const requested = params.split(";");
    const kept = requested.filter(
      (p) => p !== "" && !INPUT_REPORTING_MODES.has(Number(p)),
    );
    if (kept.length === requested.length) return match;
    return kept.length > 0 ? `\x1b[?${kept.join(";")}h` : "";
  });
}
