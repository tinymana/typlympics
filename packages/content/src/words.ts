/**
 * Sprint word list, version 1: common lowercase English words, a to z only,
 * two to eight letters. Changing this list changes generated lines, so it is
 * versioned together with the generator (see GENERATOR_VERSION).
 */
const RAW = `
of to in it is be as at so we he by or on do if me my up an go no us am
the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use
that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what year also back call down even find give hand high keep last left life live look most move must name need next open part play real room same seem show side tell then turn walk week work
about after again being could every first found great house large learn never other place plant point right small sound spell still study their there these thing think three water where which world would write young under while might night light start state story party paper music group early earth happy heart heavy horse money month river
before better change school should people number mother father friend around little always animal answer almost family follow letter listen second simple street strong system travel window wonder across during enough ground making really
because between through another thought against country picture several morning nothing outside present problem program quickly science someone teacher without general example brought
children together question remember sentence business complete consider continue describe distance exercise familiar interest language mountain personal possible practice probably standing surprise thousand tomorrow yourself
`;

export const SPRINT_WORDS: readonly string[] = Object.freeze(
  Array.from(new Set(RAW.split(/\s+/).filter((w) => w.length > 0))),
);

export const MIN_WORD_LENGTH = 2;
export const MAX_WORD_LENGTH = 8;
