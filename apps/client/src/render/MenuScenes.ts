import Phaser from 'phaser';
import { SPRINT_100M_V1, formatTime, medalFor } from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard } from '../input/keyboard';
import { FORM_WINDOW, careerStats } from '../storage/career';
import { countryName } from '../storage/countries';
import { activeProfile, browserStore, loadSave, verifyRecord, type Profile, type Save } from '../storage/save';
import { COLORS, GAME_W } from './layout';
import { ensureTextures } from './textures';
import { addBackdrop, addFooter, addHeading, addPanel, mono } from './ui';

/** Loads the signed-in athlete, or sends the player to sign in. */
function requireProfile(scene: Phaser.Scene): { save: Save; profile: Profile } | null {
  const save = loadSave(browserStore());
  const profile = activeProfile(save);
  if (!profile) {
    scene.scene.start('login');
    return null;
  }
  return { save, profile };
}

function onShutdown(scene: Phaser.Scene, detach: () => void): void {
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
}

// ------------------------------------------------------------------ TRAIN

interface EventRow {
  label: string;
  detail: string;
  playable: boolean;
}

/** Train: pick a distance, then race. Only the 100m exists so far. */
export class EventSelectScene extends Phaser.Scene {
  private selected = 0;
  private rows: EventRow[] = [];
  private boxes: Phaser.GameObjects.Rectangle[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private details: Phaser.GameObjects.Text[] = [];
  private note!: Phaser.GameObjects.Text;
  private sfx!: Sfx;

  constructor() {
    super('events');
  }

  create(): void {
    const ctx = requireProfile(this);
    if (!ctx) return;
    ensureTextures(this);
    this.sfx = new Sfx(ctx.save.settings.volume);
    this.selected = 0;
    this.boxes = [];
    this.labels = [];
    this.details = [];

    const rec = ctx.profile.records[SPRINT_100M_V1.id];
    const best = rec && verifyRecord(SPRINT_100M_V1, rec) ? `BEST ${formatTime(rec.timeMs)}` : 'NO TIME YET';
    this.rows = [
      { label: '100 M', detail: best, playable: true },
      { label: '200 M', detail: 'COMING SOON', playable: false },
      { label: '400 M', detail: 'COMING SOON', playable: false },
      { label: '800 M', detail: 'COMING SOON', playable: false },
      { label: '1500 M', detail: 'COMING SOON', playable: false },
    ];

    addBackdrop(this);
    addHeading(this, 'TRAIN', 'SELECT A DISTANCE');
    this.rows.forEach((row, i) => {
      const y = 116 + i * 62;
      this.boxes.push(this.add.rectangle(GAME_W / 2, y + 26, 520, 52, 0x2a1458).setStrokeStyle(3, 0x5b3aa6));
      this.labels.push(this.add.text(GAME_W / 2 - 236, y + 26, row.label, mono(30, COLORS.white)).setOrigin(0, 0.5));
      this.details.push(this.add.text(GAME_W / 2 + 236, y + 26, row.detail, mono(18, COLORS.ice)).setOrigin(1, 0.5));
    });
    this.note = this.add.text(GAME_W / 2, 450, '', mono(16, COLORS.red)).setOrigin(0.5);
    addFooter(this, '▲ ▼  SELECT     ENTER  RACE     ESC  BACK');

    onShutdown(
      this,
      attachKeyboard(window, {
        onChar: () => undefined,
        onControl: (key) => {
          this.sfx.unlock();
          if (key === 'ArrowUp' || key === 'ArrowDown') {
            const dir = key === 'ArrowDown' ? 1 : -1;
            this.selected = (this.selected + dir + this.rows.length) % this.rows.length;
            this.note.setText('');
            this.sfx.step();
            this.refresh();
          } else if (key === 'Enter' || key === 'Tab') {
            const row = this.rows[this.selected] as EventRow;
            if (row.playable) {
              this.sfx.marks();
              this.scene.start('race');
            } else {
              this.note.setText(`THE ${row.label.replace(' ', '')} IS NOT BUILT YET`);
              this.sfx.error();
            }
          } else if (key === 'Escape' || key === 'Backspace') {
            this.scene.start('title');
          }
        },
      }),
    );
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      const on = i === this.selected;
      (this.boxes[i] as Phaser.GameObjects.Rectangle).setFillStyle(on ? 0xffd23f : 0x2a1458).setStrokeStyle(3, on ? 0xffffff : 0x5b3aa6);
      (this.labels[i] as Phaser.GameObjects.Text).setColor(on ? COLORS.ink : row.playable ? COLORS.white : COLORS.dim);
      (this.details[i] as Phaser.GameObjects.Text).setColor(on ? COLORS.ink : row.playable ? COLORS.ice : COLORS.dim);
    });
  }
}

// ------------------------------------------------------------------ CAREER

const STANDARD_LABEL = { worldClass: 'WORLD CLASS', gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE' } as const;

/** Career: the signed-in athlete's record on this device. */
export class CareerScene extends Phaser.Scene {
  constructor() {
    super('career');
  }

  create(): void {
    const ctx = requireProfile(this);
    if (!ctx) return;
    ensureTextures(this);
    const { profile } = ctx;
    const stats = careerStats(profile, SPRINT_100M_V1.id);
    const time = (ms: number | null): string => (ms === null ? '--.--' : formatTime(Math.round(ms)));
    const num = (v: number | null, digits = 0): string => (v === null ? '-' : v.toFixed(digits));

    addBackdrop(this);
    const nation = countryName(profile.nationality);
    addHeading(this, 'CAREER', `${profile.name}   ${profile.nationality}${nation ? `  ${nation}` : ''}`);

    // Left: figures for the 100m.
    addPanel(this, 30, 106, 440, 338);
    this.add.text(46, 116, '100 M', mono(22, COLORS.gold));
    const standard = medalFor(SPRINT_100M_V1, stats.bestTimeMs);
    const trend =
      stats.trendMs === null ? '-' : `${stats.trendMs < 0 ? '-' : '+'}${formatTime(Math.abs(Math.round(stats.trendMs)))}`;
    const lines: Array<[string, string, string?]> = [
      ['BEST TIME', time(stats.bestTimeMs), COLORS.gold],
      ['BEST WPM', num(stats.bestWpm)],
      [`AVERAGE TIME (LAST ${FORM_WINDOW})`, time(stats.recentAvgTimeMs)],
      [`AVERAGE WPM (LAST ${FORM_WINDOW})`, num(stats.recentAvgWpm)],
      ['ACCURACY', stats.recentAvgAccuracy === null ? '-' : `${(stats.recentAvgAccuracy * 100).toFixed(1)}%`],
      ['AVERAGE REACTION', stats.recentAvgReactionMs === null ? '-' : `${(stats.recentAvgReactionMs / 1000).toFixed(3)} s`],
      ['RACES FINISHED', `${stats.racesFinished} OF ${stats.racesStarted}`],
      ['CLEAN RACES', `${stats.cleanRaces}`],
      ['FALSE STARTS', `${stats.falseStarts}`],
      ['TREND', trend, stats.trendMs !== null && stats.trendMs < 0 ? COLORS.green : undefined],
      ['TIME STANDARD', standard ? STANDARD_LABEL[standard] : '-'],
    ];
    lines.forEach(([name, value, color], i) => {
      const y = 152 + i * 26;
      this.add.text(46, y, name, mono(15, COLORS.ice));
      this.add.text(454, y, value, mono(17, color ?? COLORS.white)).setOrigin(1, 0);
    });

    // Right: recent races.
    addPanel(this, 490, 106, 440, 246, false);
    this.add.text(506, 116, 'RECENT RACES', mono(18, COLORS.gold));
    this.add.text(506, 146, 'DATE', mono(12, COLORS.dim));
    this.add.text(700, 146, 'TIME', mono(12, COLORS.dim)).setOrigin(1, 0);
    this.add.text(790, 146, 'WPM', mono(12, COLORS.dim)).setOrigin(1, 0);
    this.add.text(914, 146, 'ACCURACY', mono(12, COLORS.dim)).setOrigin(1, 0);
    if (stats.recent.length === 0) {
      this.add.text(710, 230, 'No races yet.\nTRAIN to set your first time.', mono(15, COLORS.dim, { align: 'center' })).setOrigin(0.5);
    }
    stats.recent.forEach((r, i) => {
      const y = 166 + i * 22;
      const d = new Date(r.at);
      const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const isBest = r.timeMs === stats.bestTimeMs;
      const color = isBest ? COLORS.gold : COLORS.white;
      this.add.text(506, y, date.toUpperCase(), mono(14, COLORS.ice));
      this.add.text(700, y, formatTime(r.timeMs), mono(15, color)).setOrigin(1, 0);
      this.add.text(790, y, `${Math.round(r.wpm)}`, mono(15, color)).setOrigin(1, 0);
      this.add.text(914, y, `${(r.accuracy * 100).toFixed(1)}%`, mono(15, color)).setOrigin(1, 0);
    });

    // Right, below: medals.
    addPanel(this, 490, 364, 440, 80, false);
    this.add.text(506, 374, 'WEEKLY MEDALS', mono(18, COLORS.gold));
    this.add.text(506, 404, 'GOLD 0     SILVER 0     BRONZE 0', mono(15, COLORS.white));
    this.add.text(506, 424, 'Medals are awarded once online leaderboards open.', mono(12, COLORS.dim));

    this.add.text(GAME_W / 2, 472, 'Other distances appear here as they are built.', mono(13, COLORS.dim)).setOrigin(0.5);
    addFooter(this, 'ESC or ENTER  BACK');

    onShutdown(
      this,
      attachKeyboard(window, {
        onChar: () => undefined,
        onControl: (key) => {
          if (key === 'Escape' || key === 'Enter' || key === 'Backspace') this.scene.start('title');
        },
      }),
    );
  }
}

// ------------------------------------------------------------------ COMPETE and WORLD RECORDS

interface InfoContent {
  heading: string;
  sub: string;
  steps: Array<[string, string]>;
  note: string;
}

const INFO: Record<'compete' | 'records', InfoContent> = {
  compete: {
    heading: 'COMPETE',
    sub: 'LIVE RACES AGAINST OTHER ATHLETES',
    steps: [
      ['HOST', 'Start a race room and pick the distance.'],
      ['INVITE', 'Others join with a room PIN or by scanning a QR code.'],
      ['RACE', 'Everyone starts on the same gun, up to eight lanes.'],
      ['RECORD', 'Results count toward the all-time leaderboard for that distance.'],
    ],
    note: 'Not built yet. Live races need the game server, which is the next major piece of work.',
  },
  records: {
    heading: 'WORLD RECORDS',
    sub: 'THE ALL-TIME LEADERBOARDS',
    steps: [
      ['FASTEST TIME', 'The best verified time ever run at each distance.'],
      ['BEST WPM', 'The highest typing speed held over a full race.'],
      ['WEEKLY MEDALS', 'The top three each week take gold, silver and bronze.'],
      ['HALL OF FAME', 'Every weekly medal, kept by month and year.'],
    ],
    note: 'Not built yet. World records arrive with online accounts, so every time can be verified.',
  },
};

class InfoScene extends Phaser.Scene {
  constructor(private readonly key: 'compete' | 'records') {
    super(key);
  }

  create(): void {
    if (!requireProfile(this)) return;
    ensureTextures(this);
    const info = INFO[this.key];
    addBackdrop(this);
    addHeading(this, info.heading, info.sub);
    addPanel(this, 150, 116, 660, 270);
    info.steps.forEach(([name, text], i) => {
      const y = 140 + i * 58;
      this.add.text(176, y, name, mono(20, COLORS.gold));
      this.add.text(176, y + 26, text, mono(15, COLORS.white));
    });
    this.add.text(GAME_W / 2, 420, 'COMING SOON', mono(26, COLORS.pink)).setOrigin(0.5);
    this.add.text(GAME_W / 2, 454, info.note, mono(13, COLORS.ice)).setOrigin(0.5);
    addFooter(this, 'ESC or ENTER  BACK');
    onShutdown(
      this,
      attachKeyboard(window, {
        onChar: () => undefined,
        onControl: (key) => {
          if (key === 'Escape' || key === 'Enter' || key === 'Backspace') this.scene.start('title');
        },
      }),
    );
  }
}

export class CompeteScene extends InfoScene {
  constructor() {
    super('compete');
  }
}

export class RecordsScene extends InfoScene {
  constructor() {
    super('records');
  }
}
