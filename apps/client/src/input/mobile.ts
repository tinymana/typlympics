import { injectChar, injectControl, SOFT_INPUT_ID, type ControlKey } from './keyboard';

/**
 * Phone and tablet support: an on-screen keyboard to type with, and
 * buttons for the menu keys a touch screen does not have.
 *
 * A phone only raises its keyboard for a focused text field, so there is a
 * hidden one. What is typed into it is read from its `input` events and
 * passed to the game one character at a time, exactly as key presses are.
 */

export type Device = 'keyboard' | 'phone';

interface TestHooks {
  /** Tests set these, since a headless browser has no touch screen or soft keyboard. */
  __typlympicsTouch?: boolean;
  __typlympicsSoftKeyboard?: boolean;
}

const hooks = (): TestHooks => window as unknown as TestHooks;

/** Space reserved under the game when the phone keyboard is open, for the race text. */
const RACE_TEXT_H = 118;
const BAR_H = 64;
/** The visual viewport must shrink by at least this for a keyboard to count as open. */
const KEYBOARD_MIN_PX = 120;
/** Characters of race text shown on the phone panel, ahead of and behind the cursor. */
const TEXT_BEHIND = 14;
const TEXT_AHEAD = 70;

class MobileUi {
  enabled = false;
  private input: HTMLInputElement | null = null;
  private bar: HTMLElement | null = null;
  private escButton: HTMLElement | null = null;
  private raceText: HTMLElement | null = null;
  private previous = '';
  private tallest = 0;
  private softCharsThisRace = 0;
  private raceTextShown = false;
  private refresh: (() => void) | null = null;
  private actionButton: HTMLElement | null = null;
  private actionHandler: (() => void) | null = null;

  /** Sets up touch controls on touch-first devices. Does nothing on a desktop. */
  init(onLayout: () => void): void {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!coarse && !hooks().__typlympicsTouch) return;
    this.enabled = true;
    this.refresh = onLayout;
    document.body.classList.add('touch');

    const input = document.createElement('input');
    input.id = SOFT_INPUT_ID;
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'go');
    input.setAttribute('aria-label', 'Type here to play');
    document.body.append(input);
    this.input = input;

    input.addEventListener('input', (e) => this.onInput(e));
    // Autocorrect and prediction work on the field's contents; clearing it
    // between words gives them nothing to rewrite.
    input.addEventListener('compositionend', () => this.reset());
    input.addEventListener('focus', () => this.setKeyboardState(true));
    input.addEventListener('blur', () => {
      this.reset();
      this.setKeyboardState(false);
    });

    this.bar = this.buildBar();
    this.escButton = this.button('ESC', 'Escape');
    this.escButton.id = 'touch-esc';
    document.body.append(this.escButton);
    this.raceText = document.createElement('div');
    this.raceText.id = 'race-text';
    this.raceText.setAttribute('aria-hidden', 'true');
    // Tapping the text reopens the keyboard if it was dismissed.
    this.raceText.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.focusKeyboard();
    });
    document.body.append(this.raceText);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', () => this.layout());
    vv?.addEventListener('scroll', () => this.layout());
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  private button(label: string, key: ControlKey | 'type'): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = 'touch-key';
    // pointerdown, not click: no delay, and focus never leaves the text field.
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (key === 'type') this.focusKeyboard();
      else injectControl(key, e.timeStamp);
    });
    return b;
  }

  private buildBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = 'touch-bar';
    const keys: Array<[string, ControlKey | 'type']> = [
      ['ESC', 'Escape'],
      ['◀', 'ArrowLeft'],
      ['▲', 'ArrowUp'],
      ['▼', 'ArrowDown'],
      ['▶', 'ArrowRight'],
      ['ENTER', 'Enter'],
      ['⌨ TYPE', 'type'],
    ];
    for (const [label, key] of keys) {
      const b = this.button(label, key);
      if (key === 'type') b.classList.add('wide', 'accent');
      if (key === 'Enter') b.classList.add('wide');
      bar.append(b);
    }
    // One extra button a screen can borrow, e.g. Invite in the race room.
    const action = document.createElement('button');
    action.type = 'button';
    action.id = 'touch-action';
    action.className = 'touch-key wide accent';
    action.hidden = true;
    action.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actionHandler?.();
    });
    bar.append(action);
    this.actionButton = action;
    document.body.append(bar);
    return bar;
  }

  /** Shows or hides the borrowed action button. Pass null to remove it. */
  setAction(label: string | null, handler: (() => void) | null = null): void {
    this.actionHandler = label ? handler : null;
    if (!this.actionButton) return;
    this.actionButton.hidden = !label;
    this.actionButton.textContent = label ?? '';
  }

  /** Puts the phone keyboard away, which brings the menu buttons back. */
  closeKeyboard(): void {
    this.input?.blur();
  }

  focusKeyboard(): void {
    this.input?.focus({ preventScroll: true });
  }

  /** True while the hidden text field has focus, which is when a phone shows its keyboard. */
  keyboardFocused(): boolean {
    return this.input !== null && document.activeElement === this.input;
  }

  /** True when an on-screen keyboard is taking up part of the screen. */
  softKeyboardOpen(): boolean {
    if (hooks().__typlympicsSoftKeyboard) return true;
    const vv = window.visualViewport;
    return !!vv && this.tallest - vv.height > KEYBOARD_MIN_PX;
  }

  private reset(): void {
    if (this.input) this.input.value = '';
    this.previous = '';
  }

  private onInput(e: Event): void {
    const input = this.input;
    if (!input) return;
    const value = input.value;
    const prev = this.previous;
    if (value.length > prev.length) {
      // Only text added past what was already there counts. If the phone
      // rewrote earlier letters, those were typed and judged already.
      for (const ch of value.slice(prev.length)) {
        if (this.softKeyboardOpen()) this.softCharsThisRace += 1;
        injectChar(ch.toLowerCase(), e.timeStamp);
      }
    } else if (value.length < prev.length) {
      for (let i = value.length; i < prev.length; i++) injectControl('Backspace', e.timeStamp);
    }
    this.previous = value;
    const composing = (e as InputEvent).isComposing === true;
    // Keep the field short so the phone has little to predict from.
    if (!composing && (value.endsWith(' ') || value.length > 24)) this.reset();
  }

  private setKeyboardState(open: boolean): void {
    document.body.classList.toggle('kb-open', open);
    this.layout();
  }

  // ---------------------------------------------------------------- race

  /** Call at the start of each race: device detection starts fresh. */
  raceBegin(): void {
    this.softCharsThisRace = 0;
  }

  /** What the race just run was typed on. */
  raceDevice(): Device {
    return this.softCharsThisRace > 0 ? 'phone' : 'keyboard';
  }

  /**
   * Shows the race text in large type under the game, where a thumb typist
   * can read it above the phone keyboard. The canvas is too small for that
   * on a phone held upright.
   */
  setRaceText(text: string, pos: number, stumbling: boolean): void {
    const el = this.raceText;
    if (!this.enabled || !el) return;
    const from = Math.max(0, pos - TEXT_BEHIND);
    const to = Math.min(text.length, pos + TEXT_AHEAD);
    const span = (cls: string, s: string): HTMLSpanElement => {
      const node = document.createElement('span');
      node.className = cls;
      node.textContent = s;
      return node;
    };
    const next = text[pos];
    el.replaceChildren(
      span('done', text.slice(from, pos)),
      ...(next !== undefined ? [span(stumbling ? 'next bad' : 'next', next === ' ' ? '␣' : next)] : []),
      span('todo', text.slice(pos + 1, to)),
    );
    if (!this.raceTextShown) {
      this.raceTextShown = true;
      document.body.classList.add('race-text-on');
      this.layout();
    }
  }

  hideRaceText(): void {
    if (!this.raceTextShown) return;
    this.raceTextShown = false;
    document.body.classList.remove('race-text-on');
    this.layout();
  }

  // ---------------------------------------------------------------- layout

  /** Fits the game into the part of the screen the keyboard leaves visible. */
  private layout(): void {
    if (!this.enabled) return;
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    this.tallest = Math.max(this.tallest, height);
    const kbOpen = document.body.classList.contains('kb-open');
    const reserved = (kbOpen ? 0 : BAR_H) + (this.raceTextShown ? RACE_TEXT_H : 0);
    const root = document.documentElement.style;
    root.setProperty('--game-top', `${top}px`);
    root.setProperty('--game-h', `${Math.max(120, height - reserved)}px`);
    root.setProperty('--panel-top', `${top + Math.max(120, height - reserved)}px`);
    root.setProperty('--visible-bottom', `${Math.max(0, window.innerHeight - (top + height))}px`);
    this.refresh?.();
  }
}

export const mobile = new MobileUi();
