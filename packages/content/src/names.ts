/**
 * Name filter for the public boards. Names are checked with digits read as
 * the letters they stand in for and spaces removed, so "SH1T" and "S H I T"
 * are caught too. The list is deliberately short and strong: it blocks slurs
 * and plain profanity, not every word someone might dislike.
 */
const BLOCKED_ANYWHERE = [
  'FUCK', 'SHIT', 'BITCH', 'CUNT', 'NIGG', 'NIGA', 'FAGG', 'FAGOT', 'DYKE', 'KIKE', 'CHINK', 'GOOK', 'WETBACK', 'TRANNY', 'RETARD',
  'WHORE', 'SLUT', 'PUSSY', 'PENIS', 'VAGINA', 'RAPIST', 'PEDO', 'NAZI', 'HITLER', 'KKK', 'PORN', 'JIZZ',
  'WANK', 'TWAT', 'BASTARD', 'ASSHOLE', 'ARSEHOLE', 'DOUCHE', 'BOLLOCK', 'MILF', 'DILDO', 'BLOWJOB', 'HANDJOB', 'CUMSHOT',
] as const;

/** Blocked only as a whole word, because they sit inside ordinary names. */
const BLOCKED_WORDS = ['DICK', 'COCK', 'SPIC', 'RAPE', 'ANUS', 'ASS', 'ARSE', 'CUM', 'FAG', 'TIT', 'TITS', 'SEX', 'HOE', 'COON', 'JAP', 'PISS', 'CRAP', 'DAMN', 'HELL'] as const;

const DIGIT_LETTERS: Record<string, string> = { '0': 'O', '1': 'I', '3': 'E', '4': 'A', '5': 'S', '7': 'T', '8': 'B', '9': 'G' };

function plain(text: string): string {
  return text.toUpperCase().replace(/[0-9]/g, (d) => DIGIT_LETTERS[d] ?? '');
}

/** False for names that should not appear on a public board. */
export function nameAllowed(name: string): boolean {
  const read = plain(name);
  const squashed = read.replace(/[^A-Z]/g, '');
  // Doubled letters are collapsed too, so "FUUUCK" reads as "FUCK".
  const collapsed = squashed.replace(/(.)\1+/g, '$1');
  for (const bad of BLOCKED_ANYWHERE) {
    if (squashed.includes(bad)) return false;
    const short = bad.replace(/(.)\1+/g, '$1');
    // Only when the collapsed form is still a distinctive word ("KKK" would collapse to "K").
    if (short.length >= 4 && collapsed.includes(short)) return false;
  }
  const words = read.split(/[^A-Z]+/).filter(Boolean);
  return !words.some((w) => (BLOCKED_WORDS as readonly string[]).includes(w)) && !(BLOCKED_WORDS as readonly string[]).includes(squashed);
}
