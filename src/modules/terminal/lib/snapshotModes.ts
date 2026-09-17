// Terminal modes a snapshot carries that belong to the program that set them,
// not to the screen contents.
//
// SerializeAddon appends _serializeModes() *last*, after both buffers, so every
// mode byte in a snapshot shapes what the next program prints rather than
// describing anything already rendered. On a cold restore that next program is
// a brand-new shell which asked for none of it.
//
// Focus reporting (1004) is the one that bites: xterm then sends ESC[I / ESC[O
// on every focus change and the shell, which has no idea what those are, echoes
// them into the prompt as ^[[I / ^[[O. The rest follow the same logic -- mouse
// tracking sprays escapes on click, bracketed paste wraps pastes the shell does
// not expect, application cursor keys break the arrow keys, application keypad
// leaves the numeric keypad emitting SS3, and the render modes below change how
// the new shell's own output is laid out.
const PRIVATE_MODE_SETS = new Set([
  1, // DECCKM - application cursor keys
  6, // DECOM - origin mode
  9, // X10 mouse reporting
  45, // reverse wraparound
  66, // DECNKM - application keypad
  1000, // VT200 mouse reporting
  1002, // button-event mouse tracking
  1003, // any-event mouse tracking
  1004, // focus reporting  <- the ^[[I / ^[[O leak
  1005, // UTF-8 mouse encoding
  1006, // SGR mouse encoding
  1015, // urxvt mouse encoding
  1016, // SGR-pixel mouse encoding
  2004, // bracketed paste
  2026, // synchronized output
]);

// CSI ? Pm [;Pm ...] h -- DEC private mode set.
const DEC_PRIVATE_SET = /\x1b\[\?([\d;]*)h/g;

// The only two non-private-set sequences _serializeModes emits. CSI 4 h is
// insert mode; CSI ? 7 l turns wraparound *off*, which is the non-default
// direction, so unlike other resets it has to go too or long commands stop
// wrapping in the restored pane.
const INSERT_MODE_SET = /\x1b\[4h/g;
const WRAPAROUND_OFF = /\x1b\[\?7l/g;

/**
 * Remove modes left behind by a program that is no longer attached, so
 * replaying a snapshot cannot reconfigure the fresh shell that inherits the
 * pty. Buffer contents and SGR styling are untouched.
 */
export function stripDeadProgramModes(snapshot: string): string {
  return snapshot
    .replace(DEC_PRIVATE_SET, (match, params: string) => {
      const requested = params.split(";");
      const kept = requested.filter(
        (p) => p !== "" && !PRIVATE_MODE_SETS.has(Number(p)),
      );
      if (kept.length === requested.length) return match;
      return kept.length > 0 ? `\x1b[?${kept.join(";")}h` : "";
    })
    .replace(INSERT_MODE_SET, "")
    .replace(WRAPAROUND_OFF, "");
}

// SerializeAddon serializes the normal buffer first, then -- when the session
// was on the alternate screen -- appends `CSI ?1049h`, a cursor home, and the
// alternate buffer's contents.
const ALT_SCREEN_ENTER = /\x1b\[\?1049h/;

/**
 * Cut the alternate-screen section off a snapshot, keeping the normal buffer.
 *
 * A fresh shell must start on the normal screen. Replaying the transition would
 * drop it into the alternate buffer of a program that is no longer running, and
 * every prompt after that would draw there until something happened to send
 * `CSI ?1049l` -- with the real normal buffer hidden behind it.
 *
 * The dead TUI's final frame is discarded rather than flattened into the normal
 * buffer: it is a snapshot of a program that no longer exists, and pasting it
 * above a live prompt reads as real output.
 */
export function dropAlternateScreen(snapshot: string): string {
  const at = snapshot.search(ALT_SCREEN_ENTER);
  return at === -1 ? snapshot : snapshot.slice(0, at);
}

/**
 * Prepare a snapshot read back from disk for replay into a brand-new pty.
 *
 * Drops the dead program's alternate screen, strips the modes it left behind,
 * and closes with an SGR reset. That last part matters because SerializeAddon
 * stops at the cell contents without restoring the pen: a program that died
 * with conceal, inverse or a colour still active leaves the snapshot ending in
 * that state, and the fresh shell's prompt inherits it -- with conceal, the
 * prompt and everything typed at it are invisible.
 */
export function sanitizeDiskSnapshot(snapshot: string): string {
  const cleaned = stripDeadProgramModes(dropAlternateScreen(snapshot));
  return cleaned === "" ? cleaned : `${cleaned}\x1b[0m`;
}
