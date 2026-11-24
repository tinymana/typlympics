import Phaser from 'phaser';
import { RIVALS, allRivalsBeaten, nextRival } from '@typlympics/content';
import { EVENT_IDS, RULESETS, eventLabel, formatTime, medalFor, rulesetFor, type EventId, type SprintRuleset } from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard } from '../input/keyboard';
import { FORM_WINDOW, careerStats } from '../storage/career';
import { countryName } from '../storage/countries';
import {
  activeProfile,
  browserStore,
  loadSave,
  rivalsBeatenFor,
  verifyRecord,
  type Profile,
  type Save,
} from '../storage/save';
import { COLORS, GAME_W } from './layout';
import { portraitKey, preloadPortraits } from './portraits';
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
  event: EventId;
  label: string;
  detail: string;
}

/** Remembered so returning from a race lands on the distance you were training. */
let lastEventIndex = 0;

function bestFor(profile: Profile, ruleset: SprintRuleset): string {
  const rec = profile.records[ruleset.id];
  return rec && verifyRecord(ruleset, rec) ? `BEST ${formatTime(rec.timeMs)}` : 'NO TIME YET';
}

/** Train, step one: pick a distance. */
export class EventSelectScene extends Phaser.Scene {
  private selected = 0;
  private rows: EventRow[] = [];
  private boxes: Phaser.GameObjects.Rectangle[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private details: Phaser.GameObjects.Text[] = [];
  private mids: Phaser.GameObjects.Text[] = [];
  private sfx!: Sfx;

  constructor() {
    super('events');
  }

  create(): void {
    const ctx = requireProfile(this);
    if (!ctx) return;
    ensureTextures(this);
    this.sfx = new Sfx(ctx.save.settings.volume);
    this.selected = lastEventIndex;
    this.boxes = [];
    this.labels = [];
    this.details = [];
    this.mids = [];

    this.rows = EVENT_IDS.map((event) => ({
      event,
      label: eventLabel(event),
      detail: bestFor(ctx.profile, RULESETS[event]),
    }));

    addBackdrop(this);
    addHeading(this, 'TRAIN', 'SELECT A DISTANCE');
    this.rows.forEach((row, i) => {
      const y = 116 + i * 62;
      const beaten = rivalsBeatenFor(ctx.profile, RULESETS[row.event].id);
      const done = RIVALS.filter((r) => beaten.includes(r.id)).length;
      this.boxes.push(this.add.rectangle(GAME_W / 2, y + 26, 620, 52, 0x2a1458).setStrokeStyle(3, 0x5b3aa6));
      this.labels.push(this.add.text(GAME_W / 2 - 286, y + 26, row.label, mono(30, COLORS.white)).setOrigin(0, 0.5));
      this.mids.push(
        this.add
          .text(GAME_W / 2 + 40, y + 26, allRivalsBeaten(beaten) ? 'MEET CHAMPION' : `RIVALS ${done}/${RIVALS.length}`, mono(15, COLORS.ice))
          .setOrigin(0.5),
      );
      this.details.push(this.add.text(GAME_W / 2 + 286, y + 26, row.detail, mono(18, COLORS.ice)).setOrigin(1, 0.5));
    });
    this.add.text(GAME_W / 2, 446, 'One character is one metre at every distance.', mono(14, COLORS.dim)).setOrigin(0.5);
    addFooter(this, 'UP / DOWN  SELECT     ENTER  NEXT     ESC  BACK');

    onShutdown(
      this,
      attachKeyboard(window, {
        onChar: () => undefined,
        onControl: (key) => {
          this.sfx.unlock();
          if (key === 'ArrowUp' || key === 'ArrowDown') {
            const dir = key === 'ArrowDown' ? 1 : -1;
            this.selected = (this.selected + dir + this.rows.length) % this.rows.length;
            this.sfx.step();
            this.refresh();
          } else if (key === 'Enter' || key === 'Tab') {
            lastEventIndex = this.selected;
            this.sfx.marks();
            this.scene.start('rivals', { event: (this.rows[this.selected] as EventRow).event });
          } else if (key === 'Escape' || key === 'Backspace') {
            this.scene.start('title');
          }
        },
      }),
    );
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((_row, i) => {
      const on = i === this.selected;
      (this.boxes[i] as Phaser.GameObjects.Rectangle).setFillStyle(on ? 0xffd23f : 0x2a1458).setStrokeStyle(3, on ? 0xffffff : 0x5b3aa6);
      (this.labels[i] as Phaser.GameObjects.Text).setColor(on ? COLORS.ink : COLORS.white);
      (this.mids[i] as Phaser.GameObjects.Text).setColor(on ? COLORS.ink : COLORS.ice);
      (this.details[i] as Phaser.GameObjects.Text).setColor(on ? COLORS.ink : COLORS.gold);
    });
  }
}

// ------------------------------------------------------------------ TRAIN: opponent

interface OpponentRow {
  rivalId: string | null;
  label: string;
  status: string;
  locked: boolean;
  beaten: boolean;
}

/**
 * Train, step two: who to race. A time trial against your own best, or the
 * roster of rivals, slowest to fastest. Each rival unlocks when the one
 * before it is beaten; nobody skips ahead.
 */
export class RivalSelectScene extends Phaser.Scene {
  private selected = 0;
  private rows: OpponentRow[] = [];
  private boxes: Phaser.GameObjects.Rectangle[] = [];
  private texts: Phaser.GameObjects.Text[][] = [];
  private note!: Phaser.GameObjects.Text;
  private sfx!: Sfx;
  private portrait!: Phaser.GameObjects.Image;
  private card!: { number: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; nick: Phaser.GameObjects.Text; band: Phaser.GameObjects.Text; state: Phaser.GameObjects.Text };
  private bestText = '';
  private ruleset: SprintRuleset = rulesetFor('100m');

  constructor() {
    super('rivals');
  }

  init(data: { event?: string | null }): void {
    this.ruleset = rulesetFor(data?.event);
  }

  preload(): void {
    preloadPortraits(this);
  }

  create(): void {
    const ctx = requireProfile(this);
    if (!ctx) return;
    ensureTextures(this);
    this.sfx = new Sfx(ctx.save.settings.volume);
    this.boxes = [];
    this.texts = [];

    const beaten = rivalsBeatenFor(ctx.profile, this.ruleset.id);
    const upNext = nextRival(beaten);
    this.bestText = bestFor(ctx.profile, this.ruleset);

    this.rows = [
      { rivalId: null, label: 'TIME TRIAL', status: this.bestText, locked: false, beaten: false },
      ...RIVALS.map((r, i): OpponentRow => {
        const isBeaten = beaten.includes(r.id);
        const previous = RIVALS[i - 1];
        const locked = !isBeaten && previous !== undefined && !beaten.includes(previous.id);
        return {
          rivalId: r.id,
          label: `${String(r.number).padStart(2, '0')}  ${r.name}`,
          status: isBeaten ? 'BEATEN' : locked ? 'LOCKED' : r.band,
          locked,
          beaten: isBeaten,
        };
      }),
    ];
    // Start on the next rival to beat, or the time trial once all are beaten.
    this.selected = upNext ? this.rows.findIndex((r) => r.rivalId === upNext.id) : 0;

    addBackdrop(this);
    const done = RIVALS.filter((r) => beaten.includes(r.id)).length;
    addHeading(
      this,
      `${eventLabel(this.ruleset.event)}  ·  CHOOSE YOUR RACE`,
      allRivalsBeaten(beaten) ? 'MEET CHAMPION: EVERY RIVAL BEATEN' : `RIVALS BEATEN  ${done} OF ${RIVALS.length}`,
    );

    // Left: the list.
    this.rows.forEach((row, i) => {
      const y = 100 + i * 34;
      this.boxes.push(this.add.rectangle(30, y, 540, 30, 0x2a1458).setOrigin(0).setStrokeStyle(2, 0x5b3aa6));
      this.texts.push([
        this.add.text(44, y + 15, row.label, mono(17, COLORS.white)).setOrigin(0, 0.5),
        this.add.text(558, y + 15, row.status, mono(14, COLORS.ice)).setOrigin(1, 0.5),
      ]);
    });
    this.note = this.add.text(300, 488, '', mono(14, COLORS.red)).setOrigin(0.5);

    // Right: the selected opponent.
    addPanel(this, 590, 100, 340, 370);
    this.portrait = this.add.image(760, 228, portraitKey('turtle')).setDisplaySize(232, 232);
    this.card = {
      number: this.add.text(604, 108, '', mono(16, COLORS.gold)),
      name: this.add.text(760, 366, '', mono(24, COLORS.white)).setOrigin(0.5),
      nick: this.add.text(760, 394, '', mono(16, COLORS.gold)).setOrigin(0.5),
      band: this.add.text(760, 420, '', mono(18, COLORS.ice)).setOrigin(0.5),
      state: this.add.text(760, 446, '', mono(14, COLORS.white)).setOrigin(0.5),
    };
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
            const row = this.rows[this.selected] as OpponentRow;
            if (row.locked) {
              const blocker = RIVALS.find((r) => this.rows.some((x) => x.rivalId === r.id && !x.beaten && !x.locked));
              this.note.setText(blocker ? `BEAT ${blocker.name} FIRST` : 'LOCKED');
              this.sfx.error();
            } else {
              this.sfx.marks();
              this.scene.start('race', { event: this.ruleset.event, rival: row.rivalId });
            }
          } else if (key === 'Escape' || key === 'Backspace') {
            this.scene.start('events');
          }
        },
      }),
    );
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      const on = i === this.selected;
      (this.boxes[i] as Phaser.GameObjects.Rectangle).setFillStyle(on ? 0xffd23f : 0x2a1458).setStrokeStyle(2, on ? 0xffffff : 0x5b3aa6);
      const [label, status] = this.texts[i] as Phaser.GameObjects.Text[];
      label?.setColor(on ? COLORS.ink : row.locked ? COLORS.dim : COLORS.white);
      status?.setColor(on ? COLORS.ink : row.beaten ? COLORS.green : row.locked ? COLORS.dim : COLORS.gold);
    });

    const row = this.rows[this.selected] as OpponentRow;
    const rival = RIVALS.find((r) => r.id === row.rivalId);
    if (rival) {
      // A locked rival is shown in silhouette until the one before is beaten.
      this.portrait.setTexture(portraitKey(rival.id)).setDisplaySize(232, 232).setVisible(true);
      if (row.locked) this.portrait.setTint(0x120824).setTintMode(Phaser.TintModes.FILL);
      else this.portrait.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      this.card.number.setText(`No. ${String(rival.number).padStart(2, '0')}`);
      this.card.name.setText(row.locked ? '? ? ?' : rival.name);
      this.card.nick.setText(row.locked ? '' : `"${rival.nickname}"`);
      this.card.band.setText(rival.band);
      this.card.state.setText(row.beaten ? 'BEATEN' : row.locked ? 'LOCKED' : 'YOUR NEXT CHALLENGER').setColor(row.beaten ? COLORS.green : row.locked ? COLORS.dim : COLORS.pink);
    } else {
      this.portrait.setVisible(false);
      this.card.number.setText('');
      this.card.name.setText('TIME TRIAL');
      this.card.nick.setText('RACE THE GHOST OF YOUR BEST RUN');
      this.card.band.setText(this.bestText);
      this.card.state.setText('');
    }
  }
}

// ------------------------------------------------------------------ CAREER

const STANDARD_LABEL = { worldClass: 'WORLD CLASS', gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE' } as const;

/** Career: the signed-in athlete's record on this device. */
export class CareerScene extends Phaser.Scene {
  private eventIndex = 0;

  constructor() {
    super('career');
  }

  init(data: { eventIndex?: number }): void {
    this.eventIndex = data?.eventIndex ?? 0;
  }

  create(): void {
    const ctx = requireProfile(this);
    if (!ctx) return;
    ensureTextures(this);
    const { profile } = ctx;
    const event = EVENT_IDS[this.eventIndex] as EventId;
    const ruleset = RULESETS[event];
    const stats = careerStats(profile, ruleset.id);
    const time = (ms: number | null): string => (ms === null ? '--.--' : formatTime(Math.round(ms)));
    const num = (v: number | null, digits = 0): string => (v === null ? '-' : v.toFixed(digits));

    addBackdrop(this);
    const nation = countryName(profile.nationality);
    addHeading(this, 'CAREER', `${profile.name}   ${profile.nationality}${nation ? `  ${nation}` : ''}`);

    // Left: figures for the 100m.
    addPanel(this, 30, 106, 440, 338);
    this.add.text(46, 116, `◀  ${eventLabel(event)}  ▶`, mono(22, COLORS.gold));
    const standard = medalFor(ruleset, stats.bestTimeMs);
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
    addPanel(this, 490, 106, 440, 190, false);
    this.add.text(506, 114, 'RECENT RACES', mono(18, COLORS.gold));
    this.add.text(506, 142, 'DATE', mono(12, COLORS.dim));
    this.add.text(700, 142, 'TIME', mono(12, COLORS.dim)).setOrigin(1, 0);
    this.add.text(790, 142, 'WPM', mono(12, COLORS.dim)).setOrigin(1, 0);
    this.add.text(914, 142, 'ACCURACY', mono(12, COLORS.dim)).setOrigin(1, 0);
    if (stats.recent.length === 0) {
      this.add.text(710, 220, 'No races yet.\nTRAIN to set your first time.', mono(15, COLORS.dim, { align: 'center' })).setOrigin(0.5);
    }
    stats.recent.slice(0, 6).forEach((r, i) => {
      const y = 160 + i * 21;
      const d = new Date(r.at);
      const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const isBest = r.timeMs === stats.bestTimeMs;
      const color = isBest ? COLORS.gold : COLORS.white;
      this.add.text(506, y, date.toUpperCase(), mono(14, COLORS.ice));
      this.add.text(700, y, formatTime(r.timeMs), mono(15, color)).setOrigin(1, 0);
      this.add.text(790, y, `${Math.round(r.wpm)}`, mono(15, color)).setOrigin(1, 0);
      this.add.text(914, y, `${(r.accuracy * 100).toFixed(1)}%`, mono(15, color)).setOrigin(1, 0);
    });

    // Right, middle: training rivals and the Meet Champion badge.
    const beaten = rivalsBeatenFor(profile, ruleset.id);
    const champion = allRivalsBeaten(beaten);
    addPanel(this, 490, 306, 440, 84, champion);
    this.add.text(506, 314, 'BADGES', mono(18, COLORS.gold));
    const done = RIVALS.filter((r) => beaten.includes(r.id)).length;
    this.add
      .text(914, 316, champion ? `★ ${eventLabel(event).replace(' ', '')} MEET CHAMPION` : `RIVALS BEATEN ${done} OF ${RIVALS.length}`, mono(15, champion ? COLORS.gold : COLORS.white))
      .setOrigin(1, 0);
    // One pip per rival, slowest to fastest, in its kit colour once beaten.
    RIVALS.forEach((r, i) => {
      const x = 504 + i * 42;
      const won = beaten.includes(r.id);
      this.add.rectangle(x, 346, 36, 16, won ? r.tint : 0x2a1458).setOrigin(0, 0).setStrokeStyle(2, won ? 0xffffff : 0x5b3aa6);
      this.add.text(x + 18, 372, r.nickname, mono(8, won ? COLORS.white : COLORS.dim)).setOrigin(0.5);
    });

    // Right, below: weekly medals.
    addPanel(this, 490, 400, 440, 44, false);
    this.add.text(506, 408, 'WEEKLY MEDALS', mono(15, COLORS.gold));
    this.add.text(914, 408, 'GOLD 0   SILVER 0   BRONZE 0', mono(14, COLORS.white)).setOrigin(1, 0);
    this.add.text(506, 426, 'Awarded once online leaderboards open.', mono(11, COLORS.dim));

    addFooter(this, 'LEFT / RIGHT  CHANGE DISTANCE     ESC or ENTER  BACK');

    onShutdown(
      this,
      attachKeyboard(window, {
        onChar: () => undefined,
        onControl: (key) => {
          if (key === 'Escape' || key === 'Enter' || key === 'Backspace') this.scene.start('title');
          else if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const dir = key === 'ArrowRight' ? 1 : -1;
            this.scene.restart({ eventIndex: (this.eventIndex + dir + EVENT_IDS.length) % EVENT_IDS.length });
          }
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
      ['INVITE', 'Others join by typing your room PIN.'],
      ['RACE', 'Everyone starts on the same gun. Up to four athletes for now.'],
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
