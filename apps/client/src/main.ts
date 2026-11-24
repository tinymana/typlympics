import Phaser from 'phaser';
import { GAME_H, GAME_W } from './render/layout';
import { LoginScene } from './render/LoginScene';
import { CareerScene, CompeteScene, EventSelectScene, RecordsScene } from './render/MenuScenes';
import { RaceScene } from './render/RaceScene';
import { TitleScene } from './render/TitleScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0d0620',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [LoginScene, TitleScene, EventSelectScene, CareerScene, CompeteScene, RecordsScene, RaceScene],
});

// Clicking the game gives it keyboard focus when embedded in another page.
window.addEventListener('pointerdown', () => window.focus());

// Handle for automated browser tests.
(window as unknown as { __typlympics: unknown }).__typlympics = game;
