/** A line of the text band: characters [start, end) of the race text. */
export interface TextLine {
  readonly start: number;
  readonly end: number;
}

/**
 * Breaks race text into display lines of at most `maxLen` characters,
 * splitting only after a space. The space stays at the end of its line,
 * because it still has to be typed.
 */
export function wrapLines(text: string, maxLen: number): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLen);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end - 1);
      // A word longer than a whole line is cut rather than looping forever.
      if (lastSpace >= start) end = lastSpace + 1;
    }
    lines.push({ start, end });
    start = end;
  }
  return lines;
}

/**
 * Which line should be at the top of a two-line window when the player is
 * at `pos`. The window follows the player but never scrolls past the last
 * two lines, so the bottom row is never left empty.
 */
export function topLineFor(lines: readonly TextLine[], pos: number): number {
  let current = lines.findIndex((l) => pos < l.end);
  if (current < 0) current = lines.length - 1;
  return Math.max(0, Math.min(current, lines.length - 2));
}
