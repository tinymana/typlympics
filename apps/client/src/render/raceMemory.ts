/**
 * Races this browser has already been sent into, so a room that is still
 * showing a race as running does not launch it a second time.
 */
const racesRun = new Set<string>();

export function markRaceRun(raceId: string): void {
  racesRun.add(raceId);
}

export function raceAlreadyRun(raceId: string): boolean {
  return racesRun.has(raceId);
}
