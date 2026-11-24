import Phaser from 'phaser';
import { SPRINT_100M_V1, formatTime } from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard } from '../input/keyboard';
import { browserStore, loadSave, verifyRecord } from '../storage/save';
import { COLORS, FONT_DISPLAY, FONT_MONO, GAME_H, GAME_W, STANDS_TOP } from './layout';
import { ensureTextures } from './textures';

export class TitleScene extends Phaser.Scene {
  private detach: (() => void) | null = null;

  constructor() {
    super('title');
  }

  create(): void {
    ensureTextures(this);
    this.add.image(0, 0, 'sky').setOrigin(0).setScale(2);
    this.add.tileSprite(0, STANDS_TOP, GAME_W, 142, 'stands').setOrigin(0);
    this.add.rectangle(0, 292, GAME_W, GAME_H - 292, 0x120824).setOrigin(0);
    this.add.tileSprite(0, 292, GAME_W, 160, 'track').setOrigin(0);

    const logoY = 96;
    const left = this.add
      .text(0, logoY, 'TYP', {
        fontFamily: FONT_DISPLAY,
        fontSize: '104px',
        fontStyle: 'italic',
        color: COLORS.ice,
        stroke: COLORS.ink,
        strokeThickness: 12,
      })
      .setOrigin(0, 0.5);
    const right = this.add
      .text(0, logoY, 'LYMPICS', {
        fontFamily: FONT_DISPLAY,
        fontSize: '104px',
        fontStyle: 'italic',
        color: COLORS.orange,
        stroke: COLORS.ink,
        strokeThickness: 12,
      })
      .setOrigin(0, 0.5);
    const total = left.width + right.width - 14;
    left.setX((GAME_W - total) / 2);
    right.setX(left.x + left.width - 14);

    this.add.rectangle(GAME_W / 2, 176, 560, 30, 0x120824, 0.85);
    this.add
      .text(GAME_W / 2, 176, "THE WORLD'S GREATEST KEYBOARD ATHLETES", {
        fontFamily: FONT_MONO,
        fontSize: '20px',
        fontStyle: 'bold',
        color: COLORS.gold,
        stroke: COLORS.ink,
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    // Menu panel.
    this.add.rectangle(GAME_W / 2, 336, 420, 150, 0x120824, 0.94).setStrokeStyle(4, 0xffd23f);
    this.add
      .text(GAME_W / 2, 296, '▶ 100M SPRINT', {
        fontFamily: FONT_MONO,
        fontSize: '30px',
        fontStyle: 'bold',
        color: COLORS.gold,
      })
      .setOrigin(0.5);

    const save = loadSave(browserStore());
    const rec = save.records[SPRINT_100M_V1.id];
    const verified = rec && verifyRecord(SPRINT_100M_V1, rec) ? rec : null;
    this.add
      .text(
        GAME_W / 2,
        338,
        verified ? `PERSONAL BEST  ${formatTime(verified.timeMs)}` : 'NO PERSONAL BEST YET',
        { fontFamily: FONT_MONO, fontSize: '20px', fontStyle: 'bold', color: COLORS.white },
      )
      .setOrigin(0.5);

    const prompt = this.add
      .text(GAME_W / 2, 378, 'PRESS ENTER TO RACE', {
        fontFamily: FONT_MONO,
        fontSize: '22px',
        fontStyle: 'bold',
        color: COLORS.pink,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });

    this.add.rectangle(0, 452, GAME_W, 88, 0x120824).setOrigin(0);
    this.add
      .text(
        GAME_W / 2,
        486,
        'Type the line as fast as you can. One correct key is one metre.\nA wrong key makes you stumble. Wait for the gun.',
        { fontFamily: FONT_MONO, fontSize: '16px', color: COLORS.ice, align: 'center' },
      )
      .setOrigin(0.5);
    this.add
      .text(GAME_W - 10, GAME_H - 8, 'TINY MANA STUDIOS  ·  M1 PROTOTYPE', {
        fontFamily: FONT_MONO,
        fontSize: '12px',
        color: COLORS.dim,
      })
      .setOrigin(1, 1);
    this.add
      .text(10, GAME_H - 8, 'Click the game if keys do not respond', {
        fontFamily: FONT_MONO,
        fontSize: '12px',
        color: COLORS.dim,
      })
      .setOrigin(0, 1);

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
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detach?.();
      this.detach = null;
    });
  }
}
