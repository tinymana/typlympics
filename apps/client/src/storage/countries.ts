/**
 * Nationalities offered at sign-in: three-letter code and name, in
 * alphabetical order by name. Codes follow the usual sports broadcast
 * abbreviations. Easy to extend: add a line.
 */
export const COUNTRIES: ReadonlyArray<readonly [code: string, name: string]> = [
  ['ARG', 'ARGENTINA'],
  ['AUS', 'AUSTRALIA'],
  ['AUT', 'AUSTRIA'],
  ['BAN', 'BANGLADESH'],
  ['BEL', 'BELGIUM'],
  ['BRA', 'BRAZIL'],
  ['BUL', 'BULGARIA'],
  ['CAN', 'CANADA'],
  ['CHI', 'CHILE'],
  ['CHN', 'CHINA'],
  ['COL', 'COLOMBIA'],
  ['CRO', 'CROATIA'],
  ['CUB', 'CUBA'],
  ['CZE', 'CZECHIA'],
  ['DEN', 'DENMARK'],
  ['EGY', 'EGYPT'],
  ['EST', 'ESTONIA'],
  ['ETH', 'ETHIOPIA'],
  ['FIN', 'FINLAND'],
  ['FRA', 'FRANCE'],
  ['GER', 'GERMANY'],
  ['GHA', 'GHANA'],
  ['GBR', 'GREAT BRITAIN'],
  ['GRE', 'GREECE'],
  ['HUN', 'HUNGARY'],
  ['ISL', 'ICELAND'],
  ['IND', 'INDIA'],
  ['INA', 'INDONESIA'],
  ['IRL', 'IRELAND'],
  ['ISR', 'ISRAEL'],
  ['ITA', 'ITALY'],
  ['JAM', 'JAMAICA'],
  ['JPN', 'JAPAN'],
  ['KEN', 'KENYA'],
  ['LAT', 'LATVIA'],
  ['LTU', 'LITHUANIA'],
  ['MAS', 'MALAYSIA'],
  ['MEX', 'MEXICO'],
  ['MAR', 'MOROCCO'],
  ['NED', 'NETHERLANDS'],
  ['NZL', 'NEW ZEALAND'],
  ['NGR', 'NIGERIA'],
  ['NOR', 'NORWAY'],
  ['PAK', 'PAKISTAN'],
  ['PER', 'PERU'],
  ['PHI', 'PHILIPPINES'],
  ['POL', 'POLAND'],
  ['POR', 'PORTUGAL'],
  ['PUR', 'PUERTO RICO'],
  ['ROU', 'ROMANIA'],
  ['KSA', 'SAUDI ARABIA'],
  ['SRB', 'SERBIA'],
  ['SGP', 'SINGAPORE'],
  ['SVK', 'SLOVAKIA'],
  ['SLO', 'SLOVENIA'],
  ['RSA', 'SOUTH AFRICA'],
  ['KOR', 'SOUTH KOREA'],
  ['ESP', 'SPAIN'],
  ['SWE', 'SWEDEN'],
  ['SUI', 'SWITZERLAND'],
  ['THA', 'THAILAND'],
  ['TTO', 'TRINIDAD AND TOBAGO'],
  ['TUR', 'TURKEY'],
  ['UKR', 'UKRAINE'],
  ['UAE', 'UNITED ARAB EMIRATES'],
  ['USA', 'UNITED STATES'],
  ['URU', 'URUGUAY'],
  ['VEN', 'VENEZUELA'],
  ['VIE', 'VIETNAM'],
  ['WLD', 'REST OF THE WORLD'],
];

export const DEFAULT_COUNTRY_INDEX = COUNTRIES.findIndex(([code]) => code === 'USA');

/** Index of the first country whose name or code starts with the typed text, or -1. */
export function findCountry(typed: string): number {
  const q = typed.toUpperCase();
  if (!q) return -1;
  const byName = COUNTRIES.findIndex(([, name]) => name.startsWith(q));
  if (byName >= 0) return byName;
  return COUNTRIES.findIndex(([code]) => code.startsWith(q));
}

export function countryName(code: string): string {
  return COUNTRIES.find(([c]) => c === code)?.[1] ?? '';
}
