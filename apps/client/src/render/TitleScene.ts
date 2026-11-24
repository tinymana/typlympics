import Phaser from 'phaser';
import { SPRINT_100M_V1, formatTime } from '@typlympics/sim';
import titleArtUrl from '../assets/title_art.webp';
import { Sfx } from '../audio/sfx';
import { attachKeyboard } from '../input/keyboard';
import { activeProfile, browserStore, loadSave, verifyRecord } from '../storage/save';
import { COLORS, FONT_DISPLAY, FONT_MONO, GAME_W } from './layout';
import { ensureTextures } from './textures';

/**
 * Title screen, built on the creative director's start-screen art.
 * The art's menu is part of the picture; only "Play event" works so far,
 * so the other rows are dimmed until their modes exist.
 */
export class TitleScene extends Phaser.Scene {
  private detach: (() => void) | null = null;

  constructor() {
    super('title');
  }

  preload(): void {
    if (!this.textures.exists('titleArt')) this.load.image('titleArt', titleArtUrl);
  }

  create(): void {
    ensureTextures(this);
    const save = loadSave(browserStore());
    const profile = activeProfile(save);
    if (!profile) {
      this.scene.start('login');
      return;
    }

    this.add.image(0, 0, 'titleArt').setOrigin(0);

    // Dim the menu rows that are not playable yet.
    this.add.rectangle(487, 430, 236, 112, 0x120824, 0.55);

    const label = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT_MONO,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: COLORS.ink,
      strokeThickness: 5,
    });

    // Signed-in athlete, top left.
    this.add.text(12, 8, `${profile.nationality}  ${profile.name}`, label(18, COLORS.white));
    this.add.text(12, 32, 'ESC: SWITCH ATHLETE', label(12, COLORS.ice));

    // Personal best, top right.
    const rec = profile.records[SPRINT_100M_V1.id];
    const verified = rec && verifyRecord(SPRINT_100M_V1, rec) ? rec : null;
    this.add.text(GAME_W - 12, 8, '100M BEST', label(12, COLORS.ice)).setOrigin(1, 0);
    this.add
      .text(GAME_W - 12, 24, verified ? formatTime(verified.timeMs) : '--.--', label(22, COLORS.gold))
      .setOrigin(1, 0);

    const prompt = this.add
      .text(GAME_W / 2, 316, 'PRESS ENTER', {
        fontFamily: FONT_DISPLAY,
        fontSize: '30px',
        fontStyle: 'italic',
        color: COLORS.white,
        stroke: COLORS.ink,
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.15, duration: 520, yoyo: true, repeat: -1 });

    const sfx = new Sfx(save.settings.volume);
    const start = (): void => {
      sfx.unlock();
      sfx.marks();
      this.scene.start('race');
    };
    this.detach = attachKeyboard(window, {
      onChar: (ch) => {
        if (ch === ' ') start();
      },
      onControl: (key) => {
        if (key === 'Enter' || key === 'Tab') start();
        else if (key === 'Escape') this.scene.start('login', { switch: true });
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detach?.();
      this.detach = null;
    });
  }
}
