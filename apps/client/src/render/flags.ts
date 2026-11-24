import type Phaser from 'phaser';
import { FLAGS, FLAG_H, FLAG_W, hasFlag, rasterFlag } from './flagData';

/** Texture key for a nationality's flag; unknown codes get the guest flag. */
export function flagKey(code: string): string {
  return `flag_${hasFlag(code) ? code : '---'}`;
}

/** Draws every flag once into its own small texture, with a dark border. */
export function ensureFlagTextures(scene: Phaser.Scene): void {
  for (const code of Object.keys(FLAGS)) {
    const key = `flag_${code}`;
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, FLAG_W + 2, FLAG_H + 2);
    if (!tex) continue;
    const ctx = tex.context;
    ctx.fillStyle = '#120824';
    ctx.fillRect(0, 0, FLAG_W + 2, FLAG_H + 2);
    const grid = rasterFlag(code);
    for (let y = 0; y < FLAG_H; y++) {
      for (let x = 0; x < FLAG_W; x++) {
        ctx.fillStyle = (grid[y] as string[])[x] as string;
        ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    tex.refresh();
  }
}

/** Adds a flag image. Origin is the left edge, vertically centred. */
export function addFlag(scene: Phaser.Scene, x: number, y: number, code: string, scale = 2): Phaser.GameObjects.Image {
  return scene.add.image(x, y, flagKey(code)).setOrigin(0, 0.5).setScale(scale);
}

/** Width of a flag on screen at a scale, for laying text out beside it. */
export function flagWidth(scale = 2): number {
  return (FLAG_W + 2) * scale;
}
