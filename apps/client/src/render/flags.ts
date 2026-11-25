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

// ------------------------------------------------------------ device icons

/** Pixel icons that show what an athlete played on: a monitor or a phone. */
const DEVICE_ART: Record<'keyboard' | 'phone', string[]> = {
  keyboard: [
    '############',
    '#oooooooooo#',
    '#oooooooooo#',
    '#oooooooooo#',
    '#oooooooooo#',
    '#oooooooooo#',
    '############',
    '....####....',
    '..########..',
  ],
  phone: [
    '.#####.',
    '#######',
    '#ooooo#',
    '#ooooo#',
    '#ooooo#',
    '#ooooo#',
    '#ooooo#',
    '#ooooo#',
    '#######',
    '###.###',
    '.#####.',
  ],
};

export function ensureDeviceTextures(scene: Phaser.Scene): void {
  for (const [device, art] of Object.entries(DEVICE_ART)) {
    const key = `device_${device}`;
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, (art[0] as string).length, art.length);
    if (!tex) continue;
    art.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        tex.context.fillStyle = ch === '#' ? '#f4f4ff' : device === 'phone' ? '#ff8fb8' : '#4a90d9';
        tex.context.fillRect(x, y, 1, 1);
      });
    });
    tex.refresh();
  }
}

export function deviceKey(device: string | null | undefined): string {
  return device === 'phone' ? 'device_phone' : 'device_keyboard';
}

/** Adds a keyboard or phone icon. Origin is the left edge, vertically centred. */
export function addDeviceIcon(scene: Phaser.Scene, x: number, y: number, device: string | null | undefined, scale = 2): Phaser.GameObjects.Image {
  return scene.add.image(x, y, deviceKey(device)).setOrigin(0, 0.5).setScale(scale);
}
