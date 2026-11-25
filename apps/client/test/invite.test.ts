import { describe, expect, it } from 'vitest';
import { inviteLink, inviteMessage, isRoomPin, roomFromAddress } from '../src/net/invite';

describe('room invites', () => {
  it('builds a link to the game with only the room PIN on it', () => {
    expect(inviteLink('12345', 'https://tinymana.github.io/typlympics/play/')).toBe('https://tinymana.github.io/typlympics/play/?room=12345');
    // Anything already on the address is dropped, so nothing else is shared by accident.
    expect(inviteLink('12345', 'https://example.test/play/?debug=1&room=99999#x')).toBe('https://example.test/play/?room=12345');
  });

  it('reads a valid PIN back from an invite link and ignores anything else', () => {
    expect(roomFromAddress('?room=12345')).toBe('12345');
    expect(roomFromAddress('?x=1&room=00042')).toBe('00042');
    for (const bad of ['', '?room=1234', '?room=123456', '?room=abcde', '?room=12 45', '?other=12345']) {
      expect(roomFromAddress(bad), bad).toBeNull();
    }
  });

  it('accepts only five-digit room PINs', () => {
    expect(isRoomPin('54321')).toBe(true);
    for (const bad of ['5432', '543210', 'abcde', '', null, undefined]) expect(isRoomPin(bad)).toBe(false);
  });

  it('writes a message that names the game, the PIN and the link', () => {
    const link = inviteLink('12345', 'https://tinymana.github.io/typlympics/play/');
    const text = inviteMessage('12345', link);
    expect(text).toContain('Typlympics');
    expect(text).toContain('12345');
    expect(text.endsWith(link)).toBe(true);
  });
});
