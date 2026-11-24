/**
 * Keyboard capture. Reads the character a key produced (layout independent)
 * and the browser's own event timestamp, which records when the key arrived
 * rather than when our code got round to handling it.
 */

export interface KeyLike {
  readonly key: string;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}

export type ControlKey =
  | 'Enter'
  | 'Tab'
  | 'Escape'
  | 'Backspace'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown';

const CONTROL_KEYS: ReadonlySet<string> = new Set<ControlKey>([
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]);

export type Classified =
  | { kind: 'char'; ch: string }
  | { kind: 'control'; key: ControlKey }
  | { kind: 'ignore' };

/**
 * Decides what a key event means for the game.
 * Held-key repeats, IME composition and shortcut chords never count.
 * Ruleset 100m@1 text is all lowercase, so letters are folded to lowercase
 * and Caps Lock cannot ruin a race.
 */
export function classifyKey(e: KeyLike): Classified {
  if (e.repeat || e.isComposing) return { kind: 'ignore' };
  if (e.ctrlKey || e.metaKey || e.altKey) return { kind: 'ignore' };
  if (CONTROL_KEYS.has(e.key)) return { kind: 'control', key: e.key as ControlKey };
  if (e.key.length === 1) return { kind: 'char', ch: e.key.toLowerCase() };
  return { kind: 'ignore' };
}

export interface KeyboardHandlers {
  onChar(ch: string, timeStamp: number): void;
  onControl(key: ControlKey, timeStamp: number): void;
}

/** Attaches listeners and returns a function that removes them. */
export function attachKeyboard(target: Window, handlers: KeyboardHandlers): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    const c = classifyKey(e);
    if (c.kind === 'ignore') return;
    // Stop the browser scrolling on space, moving focus on Tab, or opening
    // quick-find on apostrophe or slash.
    e.preventDefault();
    if (c.kind === 'char') handlers.onChar(c.ch, e.timeStamp);
    else handlers.onControl(c.key, e.timeStamp);
  };
  const onPaste = (e: Event): void => e.preventDefault();
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('paste', onPaste);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('paste', onPaste);
  };
}
