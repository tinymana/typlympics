import Phaser from 'phaser';
import { SPRINT_100M_V1, formatTime } from '@typlympics/sim';
import menuBoxUrl from '../assets/menu_box.png';
import menuRowsUrl from '../assets/menu_rows.png';
import titleArtUrl from '../assets/title_art.webp';
import { Sfx } from '../audio/sfx';
import { attachKeyboard, type ControlKey } from '../input/keyboard';
import { activeProfile, browserStore, loadSave, verifyRecord } from '../storage/save';
import { COLORS, FONT_MONO, GAME_W } from './layout';
import { addFlag, flagWidth } from './flags';
import { ensureTextures } from './textures';

/** Where the menu frame and its rows sit on the start screen, in canvas pixels. */
const BOX_X = 352;
const BOX_Y = 330;
const ROW_X = 364;
const ROW_TOPS = [339, 374, 410, 447] as const;
const ROW_W = 242;
const ROW_H = 34;

const MENU = [
  { label: 'TRAIN', scene: 'events' },
  { label: 'COMPETE', scene: 'compete' },
  { label: 'CAREER', scene: 'career' },
  { label: 'WORLD RECORDS', scene: 'records' },
] as const;

/** Remembered between visits so Esc returns to the row you came from. */
let lastSelected = 0;

/**
 * Title screen, built on the creative director's start-screen art.
 *
 * The background is the version of the art without a menu. The menu frame
 * and its four rows are cut from the version with the menu, each row in a
 * selected and an unselected state, so the lettering and icons stay exactly
 * as drawn while the menu itself is live.
 */
export class TitleScene extends Phaser.Scene {
  private detach: (() => void) | null = null;
  private rows: Phaser.GameObjects.Image[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private selected = 0;
  private sfx!: Sfx;

  constructor() {
    super('title');
  }

  preload(): void {
    if (!this.textures.exists('titleArt')) this.load.image('titleArt', titleArtUrl);
    if (!this.textures.exists('menuBox')) this.load.image('menuBox', menuBoxUrl);
    if (!this.textures.exists('menuRows')) {
      this.load.spritesheet('menuRows', menuRowsUrl, { frameWidth: ROW_W, frameHeight: ROW_H });
    }
  }

  create(): void {
    ensureTextures(this);
    const save = loadSave(browserStore());
    const profile = activeProfile(save);
    if (!profile) {
      this.scene.start('login');
      return;
    }
    this.sfx = new Sfx(save.settings.volume);
    this.selected = lastSelected;

    this.add.image(0, 0, 'titleArt').setOrigin(0);
    this.add.image(BOX_X, BOX_Y, 'menuBox').setOrigin(0);

    // Menu rows: sheet frames are [row * 2] unselected, [row * 2 + 1] selected.
    this.rows = ROW_TOPS.map((top, i) => this.add.image(ROW_X, top, 'menuRows', i * 2).setOrigin(0));
    this.cursor = this.add
      .text(0, 0, '▶', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.ink })
      .setOrigin(0.5);

    const label = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT_MONO,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: COLORS.ink,
      strokeThickness: 5,
    });

    // Signed-in athlete, top left.
    addFlag(this, 12, 19, profile.nationality);
    this.add.text(12 + flagWidth() + 8, 8, profile.name, label(18, COLORS.white));
    this.add.text(12, 32, 'ESC: SWITCH ATHLETE', label(12, COLORS.ice));

    // Personal best, top right.
    const rec = profile.records[SPRINT_100M_V1.id];
    const verified = rec && verifyRecord(SPRINT_100M_V1, rec) ? rec : null;
    this.add.text(GAME_W - 12, 8, '100M BEST', label(12, COLORS.ice)).setOrigin(1, 0);
    this.add
      .text(GAME_W - 12, 24, verified ? formatTime(verified.timeMs) : '--.--', label(22, COLORS.gold))
      .setOrigin(1, 0);

    const prompt = this.add
      .text(GAME_W / 2, 314, '▲ ▼  SELECT     ENTER  GO', label(15, COLORS.white))
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 620, yoyo: true, repeat: -1 });

    this.detach = attachKeyboard(window, {
      onChar: (ch) => {
        if (ch === ' ') this.choose();
      },
      onControl: (key) => this.onControl(key),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detach?.();
      this.detach = null;
    });
    this.refresh();
  }

  private onControl(key: ControlKey): void {
    this.sfx.unlock();
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const dir = key === 'ArrowDown' ? 1 : -1;
      this.selected = (this.selected + dir + MENU.length) % MENU.length;
      this.sfx.step();
      this.refresh();
    } else if (key === 'Enter' || key === 'Tab') {
      this.choose();
    } else if (key === 'Escape') {
      this.scene.start('login', { switch: true });
    }
  }

  private choose(): void {
    this.sfx.unlock();
    this.sfx.marks();
    lastSelected = this.selected;
    this.scene.start((MENU[this.selected] as (typeof MENU)[number]).scene);
  }

  private refresh(): void {
    this.rows.forEach((row, i) => row.setFrame(i * 2 + (i === this.selected ? 1 : 0)));
    this.cursor.setPosition(ROW_X + 14, (ROW_TOPS[this.selected] as number) + ROW_H / 2);
  }
}
