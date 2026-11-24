import type { Profile, RaceSummary } from './save';

/** How many recent races the "recent form" averages cover. */
export const FORM_WINDOW = 20;

export interface CareerStats {
  /** Races started, including ones abandoned before the finish. */
  racesStarted: number;
  racesFinished: number;
  bestTimeMs: number | null;
  bestWpm: number | null;
  /** Averages over the most recent FORM_WINDOW finished races. */
  recentAvgTimeMs: number | null;
  recentAvgWpm: number | null;
  recentAvgAccuracy: number | null;
  /** Average reaction over recent races with a legal start. */
  recentAvgReactionMs: number | null;
  bestReactionMs: number | null;
  /** Finished races with no wrong keys. */
  cleanRaces: number;
  falseStarts: number;
  /** Change in average time between the previous window and the latest one; negative is faster. */
  trendMs: number | null;
  /** Most recent finished races, newest first. */
  recent: RaceSummary[];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Career figures for one event, computed from an athlete's stored history. */
export function careerStats(profile: Profile, rulesetId: string, recentCount = 8): CareerStats {
  const runs = profile.history.filter((h) => h.rulesetId === rulesetId);
  const window = runs.slice(-FORM_WINDOW);
  const previous = runs.slice(-FORM_WINDOW * 2, -FORM_WINDOW);
  const legal = window.filter((h) => !h.falseStart && h.reactionMs !== null);
  const allLegal = runs.filter((h) => !h.falseStart && h.reactionMs !== null);
  const recentAvg = mean(window.map((h) => h.timeMs));
  const previousAvg = previous.length >= 5 ? mean(previous.map((h) => h.timeMs)) : null;

  return {
    racesStarted: Math.max(profile.totals.races, runs.length),
    racesFinished: runs.length,
    bestTimeMs: runs.length ? Math.min(...runs.map((h) => h.timeMs)) : null,
    bestWpm: runs.length ? Math.max(...runs.map((h) => h.wpm)) : null,
    recentAvgTimeMs: recentAvg,
    recentAvgWpm: mean(window.map((h) => h.wpm)),
    recentAvgAccuracy: mean(window.map((h) => h.accuracy)),
    recentAvgReactionMs: mean(legal.map((h) => h.reactionMs as number)),
    bestReactionMs: allLegal.length ? Math.min(...allLegal.map((h) => h.reactionMs as number)) : null,
    cleanRaces: runs.filter((h) => h.errors === 0).length,
    falseStarts: runs.filter((h) => h.falseStart).length,
    trendMs: recentAvg !== null && previousAvg !== null ? recentAvg - previousAvg : null,
    recent: runs.slice(-recentCount).reverse(),
  };
}
