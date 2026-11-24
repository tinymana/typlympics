/**
 * Pixel flags, drawn from data. Each flag is a 16 x 11 grid built from a
 * short list of drawing steps, so the whole set is a few kilobytes of code
 * and no image files. They are simplified, in the way 32-bit sports games
 * drew them: stripes and the main emblem, not every detail.
 *
 * This file has no dependency on the renderer so it can be unit tested.
 */

export const FLAG_W = 16;
export const FLAG_H = 11;

const R = '#d52b1e';
const W = '#ffffff';
const B = '#1f3f9a';
const DB = '#0a2a6c';
const LB = '#6cb4ee';
const G = '#1a8a3c';
const Y = '#ffd100';
const K = '#151515';
const O = '#ff8a1c';

type XY = [number, number];

export type FlagStep =
  | ['fill', string]
  | ['h', string[], number[]?]
  | ['v', string[], number[]?]
  | ['stripes', string, string]
  | ['rect', number, number, number, number, string]
  | ['disc', number, number, number, string]
  /** Lower half of a disc. */
  | ['lower', number, number, number, string]
  | ['diamond', number, number, number, number, string]
  /** Nordic cross of the given thickness. */
  | ['nordic', string, number]
  /** Triangle at the hoist, the given number of pixels deep. */
  | ['tri', string, number]
  /** Both diagonals. */
  | ['saltire', string, number]
  /** One diagonal band, top left to bottom right. */
  | ['band', string, number]
  /** Left and right quarters, as cut by the diagonals. */
  | ['sides', string]
  /** A small Union Jack in the given rectangle. */
  | ['union', number, number, number, number]
  | ['px', string, ...XY[]];

const NORDIC = (field: string, cross: string, inner?: string): FlagStep[] =>
  inner ? [['fill', field], ['nordic', cross, 3], ['nordic', inner, 1]] : [['fill', field], ['nordic', cross, 3]];

export const FLAGS: Readonly<Record<string, FlagStep[]>> = {
  ARG: [['h', [LB, W, LB]], ['disc', 8, 5, 1, Y]],
  AUS: [['fill', DB], ['union', 0, 0, 7, 5], ['px', W, [11, 2], [13, 4], [10, 6], [12, 8], [3, 8]]],
  AUT: [['h', [R, W, R]]],
  BAN: [['fill', '#006a4e'], ['disc', 7, 5, 3, R]],
  BEL: [['v', [K, Y, R]]],
  BRA: [['fill', '#009739'], ['diamond', 8, 5, 6, 4, Y], ['disc', 8, 5, 2, B]],
  BUL: [['h', [W, '#00966e', R]]],
  CAN: [['v', [R, W, R], [1, 2, 1]], ['rect', 7, 3, 2, 5, R], ['rect', 6, 4, 4, 2, R]],
  CHI: [['h', [W, R]], ['rect', 0, 0, 5, 6, B], ['px', W, [2, 2], [2, 3]]],
  CHN: [['fill', '#de2910'], ['rect', 2, 2, 2, 2, Y], ['px', Y, [5, 1], [6, 3], [6, 5], [5, 6]]],
  COL: [['h', [Y, B, R], [2, 1, 1]]],
  CRO: [['h', [R, W, B]], ['rect', 6, 3, 4, 4, R], ['px', W, [6, 3], [8, 3], [7, 4], [9, 4], [6, 5], [8, 5], [7, 6], [9, 6]]],
  CUB: [['h', [B, W, B, W, B]], ['tri', R, 6], ['px', W, [2, 5]]],
  CZE: [['h', [W, R]], ['tri', B, 7]],
  DEN: NORDIC('#c8102e', W),
  EGY: [['h', [R, W, K]], ['px', '#c09300', [7, 5], [8, 5]]],
  EST: [['h', ['#0072ce', K, W]]],
  ETH: [['h', ['#078930', Y, R]], ['disc', 8, 5, 2, B]],
  FIN: NORDIC(W, '#003580'),
  FRA: [['v', ['#0055a4', W, '#ef4135']]],
  GER: [['h', [K, '#dd0000', '#ffce00']]],
  GHA: [['h', [R, Y, '#006b3f']], ['px', K, [7, 5], [8, 5], [8, 4]]],
  GBR: [['fill', DB], ['saltire', W, 0.13], ['saltire', R, 0.045], ['rect', 0, 4, 16, 3, W], ['rect', 6, 0, 4, 11, W], ['rect', 0, 5, 16, 1, R], ['rect', 7, 0, 2, 11, R]],
  GRE: [['stripes', '#0d5eaf', W], ['rect', 0, 0, 5, 5, '#0d5eaf'], ['rect', 2, 0, 1, 5, W], ['rect', 0, 2, 5, 1, W]],
  HUN: [['h', ['#ce2939', W, '#477050']]],
  ISL: NORDIC('#02529c', W, '#dc1e35'),
  IND: [['h', ['#ff9933', W, '#138808']], ['disc', 8, 5, 1, '#000080']],
  INA: [['h', [R, W]]],
  IRL: [['v', ['#169b62', W, '#ff883e']]],
  ISR: [['fill', W], ['rect', 0, 1, 16, 1, '#0038b8'], ['rect', 0, 9, 16, 1, '#0038b8'], ['px', '#0038b8', [8, 3], [7, 4], [9, 4], [6, 5], [10, 5], [7, 6], [9, 6], [8, 7]]],
  ITA: [['v', ['#009246', W, '#ce2b37']]],
  JAM: [['fill', '#009b3a'], ['sides', K], ['saltire', '#fed100', 0.09]],
  JPN: [['fill', W], ['disc', 8, 5, 3, '#bc002d']],
  KEN: [['h', [K, W, '#bb0000', W, '#006600'], [3, 1, 3, 1, 3]], ['rect', 7, 2, 2, 7, '#bb0000'], ['px', K, [7, 5], [8, 5]], ['px', W, [7, 3], [8, 7]]],
  LAT: [['h', ['#9e3039', W, '#9e3039'], [2, 1, 2]]],
  LTU: [['h', ['#fdb913', '#006a44', '#c1272d']]],
  MAS: [['stripes', '#cc0001', W], ['rect', 0, 0, 8, 6, '#010066'], ['disc', 3, 3, 2, Y], ['disc', 4, 3, 1, '#010066'], ['px', Y, [6, 3]]],
  MEX: [['v', ['#006847', W, '#ce1126']], ['px', '#8a5a2c', [7, 5], [8, 5], [8, 4]]],
  MAR: [['fill', '#c1272d'], ['px', '#006233', [8, 3], [7, 4], [9, 4], [6, 5], [7, 5], [9, 5], [10, 5], [7, 6], [9, 6], [6, 7], [10, 7]]],
  NED: [['h', ['#ae1c28', W, '#21468b']]],
  NZL: [['fill', DB], ['union', 0, 0, 7, 5], ['px', R, [12, 2], [13, 5], [10, 5], [12, 8]]],
  NGR: [['v', ['#008751', W, '#008751']]],
  NOR: NORDIC('#ba0c2f', W, '#00205b'),
  PAK: [['fill', '#01411c'], ['rect', 0, 0, 4, 11, W], ['disc', 10, 5, 3, W], ['disc', 11, 4, 2, '#01411c'], ['px', W, [12, 3]]],
  PER: [['v', ['#d91023', W, '#d91023']]],
  PHI: [['h', ['#0038a8', '#ce1126']], ['tri', W, 7], ['px', Y, [2, 5]]],
  POL: [['h', [W, '#dc143c']]],
  POR: [['v', ['#006600', '#ff0000'], [2, 3]], ['disc', 6, 5, 2, Y]],
  PUR: [['h', [R, W, R, W, R]], ['tri', '#0050f0', 6], ['px', W, [2, 5]]],
  ROU: [['v', ['#002b7f', '#fcd116', '#ce1126']]],
  KSA: [['fill', '#006c35'], ['rect', 4, 3, 8, 2, W], ['px', '#006c35', [5, 3], [7, 4], [9, 3], [10, 4]], ['rect', 4, 7, 8, 1, W]],
  SRB: [['h', ['#c6363c', '#0c4076', W]], ['rect', 4, 3, 3, 4, '#c6363c'], ['px', W, [5, 4], [5, 5]]],
  SGP: [['h', ['#ed2939', W]], ['disc', 3, 2, 2, W], ['disc', 4, 2, 1, '#ed2939'], ['px', W, [6, 1], [7, 3]]],
  SVK: [['h', [W, '#0b4ea2', '#ee1c25']], ['rect', 3, 3, 3, 5, '#ee1c25'], ['px', W, [4, 4], [4, 5], [3, 5], [5, 5]]],
  SLO: [['h', [W, '#005da4', '#ed1c24']], ['rect', 3, 1, 3, 4, '#005da4'], ['px', W, [4, 2], [3, 3], [5, 3]]],
  RSA: [['h', ['#de3831', W, '#007a4d', W, '#002395'], [3, 1, 3, 1, 3]], ['tri', '#ffb612', 6], ['tri', K, 4]],
  KOR: [['fill', W], ['disc', 8, 5, 3, '#cd2e3a'], ['lower', 8, 5, 3, '#0047a0'], ['px', K, [3, 2], [4, 1], [12, 2], [11, 1], [3, 8], [4, 9], [12, 8], [11, 9]]],
  ESP: [['h', ['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]], ['px', '#aa151b', [5, 5], [5, 4]]],
  SWE: NORDIC('#006aa7', '#fecc00'),
  SUI: [['fill', '#da291c'], ['rect', 7, 2, 2, 7, W], ['rect', 5, 4, 6, 3, W]],
  THA: [['h', ['#a51931', W, '#2d2a4a', W, '#a51931'], [2, 1, 5, 1, 2]]],
  TTO: [['fill', '#ce1126'], ['band', W, 0.2], ['band', K, 0.13]],
  TUR: [['fill', '#e30a17'], ['disc', 6, 5, 3, W], ['disc', 7, 5, 2, '#e30a17'], ['px', W, [10, 5]]],
  UKR: [['h', ['#0057b7', '#ffd700']]],
  UAE: [['h', ['#00732f', W, K]], ['rect', 0, 0, 4, 11, '#ff0000']],
  USA: [['stripes', '#b22234', W], ['rect', 0, 0, 7, 6, '#3c3b6e'], ['px', W, [1, 1], [3, 1], [5, 1], [2, 2], [4, 2], [1, 3], [3, 3], [5, 3], [2, 4], [4, 4]]],
  URU: [['stripes', W, '#0038a8'], ['rect', 0, 0, 5, 5, W], ['rect', 1, 1, 3, 3, '#fcd116']],
  VEN: [['h', ['#ffcc00', '#00247d', '#cf142b']], ['px', W, [6, 5], [8, 4], [10, 5]]],
  VIE: [['fill', '#da251d'], ['rect', 7, 4, 3, 3, '#ffff00'], ['px', '#ffff00', [8, 3], [6, 5], [10, 5], [7, 7], [9, 7]]],
  WLD: [['fill', '#12357a'], ['disc', 8, 5, 4, '#4a90d9'], ['px', '#3fa45e', [6, 3], [7, 3], [6, 4], [7, 5], [9, 5], [10, 5], [10, 6], [9, 7], [8, 7]]],
  // Guest and unknown codes.
  '---': [['fill', '#3b1d6e'], ['px', W, [7, 3], [8, 3], [9, 4], [8, 5], [8, 6], [8, 8]]],
};

function bands(count: number, weights: number[] | undefined, size: number): number[] {
  const w = weights ?? new Array<number>(count).fill(1);
  const total = w.reduce((a, b) => a + b, 0);
  const edges: number[] = [];
  let acc = 0;
  for (const x of w) {
    acc += x;
    edges.push(Math.round((acc / total) * size));
  }
  return edges;
}

/** Runs a flag's steps into a grid of colours, FLAG_H rows of FLAG_W. */
export function rasterFlag(code: string): string[][] {
  const steps = FLAGS[code] ?? (FLAGS['---'] as FlagStep[]);
  const grid: string[][] = Array.from({ length: FLAG_H }, () => new Array<string>(FLAG_W).fill('#000000'));
  const set = (x: number, y: number, c: string): void => {
    if (x >= 0 && x < FLAG_W && y >= 0 && y < FLAG_H) (grid[y] as string[])[x] = c;
  };
  const each = (fn: (x: number, y: number) => string | null): void => {
    for (let y = 0; y < FLAG_H; y++) for (let x = 0; x < FLAG_W; x++) {
      const c = fn(x, y);
      if (c) set(x, y, c);
    }
  };
  // Position along each axis, 0 to 1.
  const u = (x: number): number => x / (FLAG_W - 1);
  const v = (y: number): number => y / (FLAG_H - 1);

  for (const step of steps) {
    switch (step[0]) {
      case 'fill':
        each(() => step[1]);
        break;
      case 'h': {
        const edges = bands(step[1].length, step[2], FLAG_H);
        each((_x, y) => step[1][edges.findIndex((e) => y < e)] ?? null);
        break;
      }
      case 'v': {
        const edges = bands(step[1].length, step[2], FLAG_W);
        each((x) => step[1][edges.findIndex((e) => x < e)] ?? null);
        break;
      }
      case 'stripes':
        each((_x, y) => (y % 2 === 0 ? step[1] : step[2]));
        break;
      case 'rect':
        for (let y = step[2]; y < step[2] + step[4]; y++) for (let x = step[1]; x < step[1] + step[3]; x++) set(x, y, step[5]);
        break;
      case 'disc':
        each((x, y) => ((x - step[1]) ** 2 + (y - step[2]) ** 2 <= step[3] ** 2 + step[3] * 0.8 ? step[4] : null));
        break;
      case 'lower':
        each((x, y) => (y > step[2] && (x - step[1]) ** 2 + (y - step[2]) ** 2 <= step[3] ** 2 + step[3] * 0.8 ? step[4] : null));
        break;
      case 'diamond':
        each((x, y) => (Math.abs(x - step[1]) / step[3] + Math.abs(y - step[2]) / step[4] <= 1 ? step[5] : null));
        break;
      case 'nordic': {
        const half = (step[2] - 1) / 2;
        each((x, y) => (Math.abs(x - 5) <= half || Math.abs(y - 5) <= half ? step[1] : null));
        break;
      }
      case 'tri':
        each((x, y) => (x < Math.round(step[2] * (1 - Math.abs(y - 5) / 5.5)) ? step[1] : null));
        break;
      case 'saltire':
        each((x, y) => (Math.abs(u(x) - v(y)) < step[2] || Math.abs(u(x) - (1 - v(y))) < step[2] ? step[1] : null));
        break;
      case 'band':
        each((x, y) => (Math.abs(u(x) - v(y)) < step[2] ? step[1] : null));
        break;
      case 'sides':
        each((x, y) => (Math.abs(u(x) - 0.5) > Math.abs(v(y) - 0.5) ? step[1] : null));
        break;
      case 'union': {
        const [, ox, oy, w, h] = step;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const d = Math.abs(x / (w - 1) - y / (h - 1)) < 0.12 || Math.abs(x / (w - 1) - (1 - y / (h - 1))) < 0.12;
          set(ox + x, oy + y, d ? W : DB);
        }
        const cx = ox + Math.floor(w / 2);
        const cy = oy + Math.floor(h / 2);
        for (let x = ox; x < ox + w; x++) set(x, cy, R);
        for (let y = oy; y < oy + h; y++) set(cx, y, R);
        break;
      }
      case 'px':
        for (const p of step.slice(2) as XY[]) set(p[0], p[1], step[1]);
        break;
    }
  }
  return grid;
}

export function hasFlag(code: string): boolean {
  return code in FLAGS;
}

// Keep the palette constants referenced even where a flag uses its own exact shade.
export const FLAG_PALETTE = { R, W, B, DB, LB, G, Y, K, O } as const;
