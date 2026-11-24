import type Phaser from 'phaser';
import { createRng } from '@typlympics/content';

/**
 * Every texture is drawn in code from rectangles: original placeholder art
 * in the sunset palette of the title-screen concept. Art is authored at half
 * size; `S` bakes tiles at double size so pixels match the scaled sprites.
 */
const S = 2;

type Ctx = CanvasRenderingContext2D;

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  scale: number,
  draw: (ctx: Ctx) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * scale, h * scale);
  if (!tex) return;
  const ctx = tex.context;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.scale(scale, scale);
  draw(ctx);
  ctx.restore();
  tex.refresh();
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ---------------------------------------------------------------- sky

const SKY_BANDS = ['#1b0f3b', '#2a1458', '#45207a', '#6a2a8f', '#9b2f8f', '#d0407f', '#f0625f', '#ff8a4a', '#ffb347'];

function drawSky(ctx: Ctx): void {
  const W = 480;
  const H = 100;
  const bandH = Math.ceil(H / SKY_BANDS.length);
  SKY_BANDS.forEach((color, i) => {
    rect(ctx, 0, i * bandH, W, bandH, color);
    // Checker dither into the next band.
    const next = SKY_BANDS[i + 1];
    if (next) {
      for (let x = 0; x < W; x += 2) {
        rect(ctx, x, (i + 1) * bandH - 2, 1, 1, next);
        rect(ctx, x + 1, (i + 1) * bandH - 1, 1, 1, next);
      }
    }
  });
  // Stars.
  const rng = createRng('sky');
  for (let i = 0; i < 40; i++) rect(ctx, rng.int(W), rng.int(30), 1, 1, i % 3 === 0 ? '#ffffff' : '#b9a6ff');
  // Striped retro sun.
  const cx = 240;
  const cy = 64;
  const r = 34;
  for (let y = -r; y <= r; y++) {
    if (y > 4 && (y - 4) % 6 >= 4) continue; // gaps in the lower half
    const half = Math.floor(Math.sqrt(r * r - y * y));
    const color = y < -12 ? '#fff1a8' : y < 6 ? '#ffd23f' : '#ff9a3c';
    rect(ctx, cx - half, cy + y, half * 2, 1, color);
  }
  // Mountain silhouette along the horizon.
  let height = 12;
  for (let x = 0; x < W; x += 2) {
    height += rng.int(5) - 2;
    height = Math.max(6, Math.min(22, height));
    rect(ctx, x, H - height, 2, height, '#3b1d6e');
  }
}

// ---------------------------------------------------------------- stands

const CROWD = ['#ff4d8d', '#ffd23f', '#6fd3ff', '#f4f4ff', '#c58cff', '#ff9a3c', '#e8a070', '#8a5a3c'];

function drawStands(ctx: Ctx): void {
  const W = 240;
  const H = 71;
  const rng = createRng('stands');
  rect(ctx, 0, 0, W, H, '#241247');
  // Roof edge and floodlight glow.
  rect(ctx, 0, 0, W, 3, '#5b3aa6');
  rect(ctx, 0, 3, W, 1, '#8e6be0');
  // Terraces of spectators.
  for (let row = 0; row < 12; row++) {
    const y = 6 + row * 4;
    rect(ctx, 0, y + 3, W, 1, '#1a0b33');
    for (let x = row % 2; x < W; x += 3) {
      if (rng.next() < 0.12) continue;
      rect(ctx, x, y, 2, 2, rng.pick(CROWD));
      rect(ctx, x, y + 2, 2, 1, '#3a2466');
    }
  }
  // Support pillars.
  for (let x = 0; x < W; x += 80) rect(ctx, x, 4, 2, 50, '#140a2b');
  // Advertising boards along the trackside, in house colours.
  const boardY = 56;
  rect(ctx, 0, boardY - 1, W, 1, '#f4f4ff');
  const boards = ['#ff4d8d', '#2a1458', '#ffd23f', '#2a1458', '#6fd3ff', '#2a1458'];
  for (let i = 0; i < 6; i++) {
    const x = i * 40;
    rect(ctx, x, boardY, 40, 12, boards[i] as string);
    rect(ctx, x, boardY, 1, 12, '#120824');
    // Abstract lettering blocks.
    const ink = i % 2 === 0 ? '#120824' : '#ffd23f';
    for (let k = 0; k < 6; k++) rect(ctx, x + 5 + k * 5, boardY + 4, 3, 4, ink);
  }
  rect(ctx, 0, H - 3, W, 3, '#3f7a4a'); // grass verge
}

// ---------------------------------------------------------------- track

function drawTrack(ctx: Ctx): void {
  // One lane, 32 x 20 art pixels.
  const rng = createRng('track');
  rect(ctx, 0, 0, 32, 20, '#b2355f');
  for (let i = 0; i < 26; i++) rect(ctx, rng.int(32), 1 + rng.int(19), 1, 1, i % 2 ? '#9c2c53' : '#c44a72');
  rect(ctx, 0, 0, 32, 1, '#f4e9ff');
}

function drawChecker(ctx: Ctx): void {
  for (let y = 0; y < 80; y += 2) {
    for (let x = 0; x < 6; x += 2) {
      rect(ctx, x, y, 2, 2, (x + y) % 4 === 0 ? '#ffffff' : '#120824');
    }
  }
}

// ---------------------------------------------------------------- athlete

interface Pose {
  hip: [number, number];
  /** Torso angle in degrees from upright, positive leaning forward. */
  torso: number;
  /** [thigh, shin] angles from straight down, positive forward. Near leg first. */
  legs: [[number, number], [number, number]];
  /** [upper arm, forearm] angles from straight down. Near arm first. */
  arms: [[number, number], [number, number]];
}

const POSES: Record<string, Pose> = {
  idle: { hip: [11, 19], torso: 2, legs: [[4, 0], [-4, 0]], arms: [[8, 12], [-8, -4]] },
  marks: { hip: [8, 23], torso: 78, legs: [[72, -42], [-12, -62]], arms: [[4, -2], [10, 4]] },
  set: { hip: [9, 19], torso: 100, legs: [[48, -28], [4, -44]], arms: [[2, -2], [8, 4]] },
  run0: { hip: [11, 19], torso: 18, legs: [[62, -8], [-28, -84]], arms: [[-52, 28], [42, 122]] },
  run1: { hip: [11, 19], torso: 16, legs: [[30, 8], [-6, -72]], arms: [[-22, 58], [16, 96]] },
  run2: { hip: [11, 19], torso: 18, legs: [[-28, -84], [62, -8]], arms: [[42, 122], [-52, 28]] },
  run3: { hip: [11, 19], torso: 16, legs: [[-6, -72], [30, 8]], arms: [[16, 96], [-22, 58]] },
  stumble: { hip: [11, 20], torso: 58, legs: [[44, 22], [-42, -66]], arms: [[84, 104], [62, 92]] },
  win: { hip: [11, 19], torso: -4, legs: [[6, 0], [-6, 0]], arms: [[164, 178], [-164, -178]] },
  // Finish dip: chest thrown at the line, arms swept back.
  dip: { hip: [10, 19], torso: 56, legs: [[38, 12], [-34, -82]], arms: [[-72, -58], [-62, -48]] },
};

// Drive phase out of the blocks: the run cycle with a low, forward torso.
for (let i = 0; i < 4; i++) {
  const run = POSES[`run${i}`] as Pose;
  POSES[`drv${i}`] = { ...run, hip: [10, 20], torso: 46 };
}

export const ATHLETE_FRAMES = Object.keys(POSES);
export const ATHLETE_W = 24;
export const ATHLETE_H = 32;

const SKIN = '#e8a070';
const SKIN_FAR = '#b9744a';
const KIT = '#f4f4ff';
const KIT_STRIPE = '#ff4d8d';
const SHORTS = '#5a2ea6';
const SHORTS_FAR = '#43207f';
const SHOE = '#ffd23f';
const HAIR = '#7a4420';

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Draws a 2 px thick pixel line and returns its end point. */
function limb(ctx: Ctx, x: number, y: number, angle: number, len: number, color: string): [number, number] {
  const dx = Math.sin(rad(angle));
  const dy = Math.cos(rad(angle));
  ctx.fillStyle = color;
  for (let i = 0; i <= len * 2; i++) {
    ctx.fillRect(Math.round(x + (dx * i) / 2) - 1, Math.round(y + (dy * i) / 2) - 1, 2, 2);
  }
  return [x + dx * len, y + dy * len];
}

function drawLeg(ctx: Ctx, hip: [number, number], angles: [number, number], near: boolean): void {
  const [kx, ky] = limb(ctx, hip[0], hip[1], angles[0], 6, near ? SKIN : SKIN_FAR);
  // Shorts cover the top of the thigh.
  limb(ctx, hip[0], hip[1], angles[0], 2, near ? SHORTS : SHORTS_FAR);
  const [fx, fy] = limb(ctx, kx, ky, angles[1], 6, near ? SKIN : SKIN_FAR);
  rect(ctx, fx - 1, fy - 1, 4, 2, near ? SHOE : '#c9a12c');
}

function drawArm(ctx: Ctx, shoulder: [number, number], angles: [number, number], near: boolean): void {
  const [ex, ey] = limb(ctx, shoulder[0], shoulder[1], angles[0], 5, near ? SKIN : SKIN_FAR);
  limb(ctx, ex, ey, angles[1], 4, near ? SKIN : SKIN_FAR);
}

function drawAthlete(ctx: Ctx, pose: Pose): void {
  const hip = pose.hip;
  const sx = hip[0] + Math.sin(rad(pose.torso)) * 8;
  const sy = hip[1] - Math.cos(rad(pose.torso)) * 8;
  const shoulder: [number, number] = [sx, sy];

  drawArm(ctx, shoulder, pose.arms[1], false);
  drawLeg(ctx, hip, pose.legs[1], false);

  // Torso: white singlet with a pink stripe, 4 px thick.
  const dx = Math.sin(rad(pose.torso));
  const dy = -Math.cos(rad(pose.torso));
  for (let i = 0; i <= 16; i++) {
    const x = Math.round(hip[0] + (dx * i) / 2);
    const y = Math.round(hip[1] + (dy * i) / 2);
    rect(ctx, x - 2, y - 2, 4, 4, i >= 6 && i <= 9 ? KIT_STRIPE : KIT);
  }
  rect(ctx, hip[0] - 2, hip[1] - 1, 4, 3, SHORTS);

  // Head sits past the shoulder, along the torso line.
  const hx = Math.round(sx + dx * 4);
  const hy = Math.round(sy + dy * 4);
  rect(ctx, hx - 2, hy - 3, 5, 6, SKIN);
  rect(ctx, hx - 3, hy - 4, 6, 2, HAIR); // hair on top
  rect(ctx, hx - 4, hy - 3, 2, 6, HAIR); // mullet at the back
  rect(ctx, hx - 3, hy - 2, 6, 1, KIT); // headband
  rect(ctx, hx, hy - 1, 3, 2, '#2a1458'); // shades
  rect(ctx, hx + 2, hy - 1, 1, 1, KIT_STRIPE);

  drawLeg(ctx, hip, pose.legs[0], true);
  drawArm(ctx, shoulder, pose.arms[0], true);
}

// ---------------------------------------------------------------- entry point

export function ensureTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'sky', 480, 100, 1, drawSky);
  makeTexture(scene, 'stands', 240, 71, S, drawStands);
  makeTexture(scene, 'track', 32, 20, S, drawTrack);
  makeTexture(scene, 'checker', 6, 80, 1, drawChecker);
  for (const frame of ATHLETE_FRAMES) {
    makeTexture(scene, `ath_${frame}`, ATHLETE_W, ATHLETE_H, 1, (ctx) =>
      drawAthlete(ctx, POSES[frame] as Pose),
    );
  }
  makeTexture(scene, 'shadow', 16, 3, 1, (ctx) => {
    rect(ctx, 2, 0, 12, 1, 'rgba(18,8,36,0.55)');
    rect(ctx, 0, 1, 16, 1, 'rgba(18,8,36,0.55)');
    rect(ctx, 2, 2, 12, 1, 'rgba(18,8,36,0.55)');
  });
}
