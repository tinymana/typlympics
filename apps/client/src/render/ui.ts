import type Phaser from 'phaser';
import { COLORS, FONT_DISPLAY, FONT_MONO, GAME_H, GAME_W } from './layout';

/** Shared pieces for the menu screens. */

export function mono(size: number, color: string, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_MONO, fontSize: `${size}px`, fontStyle: 'bold', color, ...extra };
}

/** The start-screen art, darkened, behind a menu screen. */
export function addBackdrop(scene: Phaser.Scene): void {
  if (scene.textures.exists('titleArt')) scene.add.image(0, 0, 'titleArt').setOrigin(0);
  else scene.add.image(0, 0, 'sky').setOrigin(0).setScale(2);
  scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x120824, 0.82).setOrigin(0);
}

export function addHeading(scene: Phaser.Scene, text: string, sub?: string): void {
  scene.add
    .text(GAME_W / 2, 44, text, {
      fontFamily: FONT_DISPLAY,
      fontSize: '46px',
      fontStyle: 'italic',
      color: COLORS.gold,
      stroke: COLORS.ink,
      strokeThickness: 8,
    })
    .setOrigin(0.5);
  if (sub) scene.add.text(GAME_W / 2, 84, sub, mono(16, COLORS.ice)).setOrigin(0.5);
}

export function addFooter(scene: Phaser.Scene, text: string): void {
  scene.add.rectangle(0, GAME_H - 34, GAME_W, 34, 0x120824, 0.9).setOrigin(0);
  scene.add.rectangle(0, GAME_H - 34, GAME_W, 2, 0xffd23f).setOrigin(0);
  scene.add.text(GAME_W / 2, GAME_H - 17, text, mono(14, COLORS.ice)).setOrigin(0.5);
}

export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, gold = true): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, 0x1a0b2e, 0.94).setOrigin(0).setStrokeStyle(3, gold ? 0xffd23f : 0x5b3aa6);
}
