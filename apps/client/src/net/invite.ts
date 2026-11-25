/**
 * Room invites: a link that carries the room PIN, so a friend can tap it
 * and land in the room once they have signed in.
 */

const ROOM_PARAM = 'room';
let pendingRoom: string | null = null;

export function isRoomPin(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9]{5}$/.test(value);
}

/** The link to send, built from the address the game is running at. */
export function inviteLink(pin: string, base: string): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set(ROOM_PARAM, pin);
  return url.toString();
}

export function inviteMessage(pin: string, link: string): string {
  return `Race me at Typlympics! Room PIN ${pin}: ${link}`;
}

/** Reads a room PIN from an invite link's address, if it has a valid one. */
export function roomFromAddress(search: string): string | null {
  const pin = new URLSearchParams(search).get(ROOM_PARAM);
  return isRoomPin(pin) ? pin : null;
}

/** Call once at start-up: remembers an invite and tidies it out of the address bar. */
export function captureInvite(): void {
  const pin = roomFromAddress(window.location.search);
  if (!pin) return;
  pendingRoom = pin;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(ROOM_PARAM);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // Not being able to tidy the address is harmless.
  }
}

export function hasPendingInvite(): boolean {
  return pendingRoom !== null;
}

/** Returns the invited room once, then forgets it. */
export function takePendingInvite(): string | null {
  const pin = pendingRoom;
  pendingRoom = null;
  return pin;
}

export type InviteOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Sends the invite. On a phone this opens the share sheet, where Messages
 * and other apps are one tap away; elsewhere it copies the invite so it
 * can be pasted into any chat. Must be called from a key press or a tap.
 */
export async function sendInvite(pin: string, preferShare: boolean): Promise<InviteOutcome> {
  const link = inviteLink(pin, window.location.href);
  const text = inviteMessage(pin, link);
  if (preferShare && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Typlympics', text: `Race me at Typlympics! Room PIN ${pin}`, url: link });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
