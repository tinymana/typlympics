import Phaser from 'phaser';
import { mobile } from './input/mobile';
import { captureInvite } from './net/invite';
import { GAME_H, GAME_W } from './render/layout';
import { LoginScene } from './render/LoginScene';
import { CareerScene, EventSelectScene, RivalSelectScene } from './render/MenuScenes';
import { CompeteScene, LobbyScene, RecordsScene } from './render/OnlineScenes';
import { RaceScene } from './render/RaceScene';
import { TitleScene } from './render/TitleScene';

// An invite link carries a room PIN; remember it before anything else runs.
captureInvite();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0d0620',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [LoginScene, TitleScene, EventSelectScene, RivalSelectScene, CareerScene, CompeteScene, LobbyScene, RecordsScene, RaceScene],
});

// Touch devices get an on-screen keyboard and menu buttons; the game is
// refitted whenever the phone keyboard opens or closes.
mobile.init(() => game.scale.refresh());

// Clicking the game gives it keyboard focus when embedded in another page.
window.addEventListener('pointerdown', () => window.focus());

// Handle for automated browser tests.
(window as unknown as { __typlympics: unknown }).__typlympics = game;
