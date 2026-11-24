/** Screen and track geometry, in canvas pixels. Art is drawn at half size and doubled. */
export const GAME_W = 960;
export const GAME_H = 540;

export const SKY_H = 200;
export const STANDS_TOP = 150;
export const TRACK_TOP = 292;
export const LANE_H = 40;
export const LANES = 4;
export const TRACK_BOTTOM = TRACK_TOP + LANE_H * LANES; // 452
export const HUD_TOP = TRACK_BOTTOM;

/** World x of the start line and pixels per metre. */
export const START_X = 220;
export const PX_PER_M = 22;

export const PLAYER_LANE = 2;
export const GHOST_LANE = 1;

export function laneFeetY(lane: number): number {
  return TRACK_TOP + lane * LANE_H + 34;
}

export const FONT_MONO = '"Courier New", Courier, monospace';
export const FONT_DISPLAY = 'Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif';

export const COLORS = {
  ink: '#120824',
  gold: '#ffd23f',
  orange: '#ff9a3c',
  pink: '#ff4d8d',
  ice: '#cfe8ff',
  white: '#ffffff',
  dim: '#7d6aa8',
  red: '#ff5566',
  green: '#6dffa8',
} as const;
