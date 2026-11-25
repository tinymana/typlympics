import Phaser from 'phaser';
import {
  RIVALS,
  allRivalsBeaten,
  generateAiLog,
  generateSprintLine,
  rivalById,
  type Rival,
  type SprintLine,
} from '@typlympics/content';
import {
  eventLabel,
  rulesetFor,
  applyInput,
  createSprint,
  formatTime,
  medalFor,
  positionAt,
  simulate,
  type InputEvent,
  type Medal,
  type SprintResult,
  type SprintRuleset,
  type SprintState,
  type StepKind,
} from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard, type ControlKey } from '../input/keyboard';
import { mobile, type Device } from '../input/mobile';
import { online as onlineApi, ordinal, type OfficialResult, type RoomMember, type Standing } from '../net/online';
import {
  activeProfile,
  addToHistory,
  browserStore,
  loadSave,
  markRivalBeaten,
  packLog,
  persistSave,
  rivalsBeatenFor,
  verifyRecord,
  type KeyValueStore,
  type Profile,
  type Save,
} from '../storage/save';
import {
  COLORS,
  FONT_DISPLAY,
  FONT_MONO,
  GAME_H,
  GAME_W,
  GHOST_LANE,
  HUD_TOP,
  LANES,
  LANE_H,
  PLAYER_LANE,
  PX_PER_M,
  STANDS_TOP,
  START_X,
  TRACK_TOP,
  laneFeetY,
} from './layout';
import { addFlag, flagKey, flagWidth } from './flags';
import { ensureTextures } from './textures';
import { topLineFor, wrapLines, type TextLine } from './textLines';

type Phase = 'marks' | 'set' | 'race' | 'result';

/** Everything a live online race needs, handed over by the race room. */
export interface OnlineRace {
  pin: string;
  token: string;
  /** This player's online athlete id. */
  you: string;
  race: { id: string; event: string; seed: string };
  /** Local clock time (performance.now) of the gun. */
  gunAt: number;
  members: RoomMember[];
}

interface Opponent {
  id: string;
  runner: Runner;
  tag: Phaser.GameObjects.Text;
  flag: Phaser.GameObjects.Image;
  pos: number;
}

const LANE_TINTS = [0xff9a5c, 0x8fd0ff, 0xb9e08a, 0xc9a0ff] as const;
const TICK_MS = 400;
const RESULT_POLL_MS = 1000;
const RESULT_POLLS_MAX = 120;

const MARKS_MS = 1500;
const GUN_DELAY_MIN_MS = 1000;
const GUN_DELAY_MAX_MS = 2500;
const RUN_FRAMES = ['ath_run0', 'ath_run1', 'ath_run2', 'ath_run3'] as const;
const DRIVE_FRAMES = ['ath_drv0', 'ath_drv1', 'ath_drv2', 'ath_drv3'] as const;
/** Metres run with a low torso after the start. */
const DRIVE_METRES = 5;
const DIP_MS = 240;
/** A finish this close to the personal best is announced as a photo finish. */
const PHOTO_FINISH_MS = 100;
/** Clean keys in a row before speed lines appear. Presentation only (D11). */
const STREAK_START = 15;
const STREAK_FULL = 45;
const CELL_W = 17;
const LINE_Y = [484, 516] as const;
/** Characters per row of the text band. */
const LINE_MAX = 54;
/** Paint state of one character cell, so a cell is only redrawn when it changes. */
const enum Cell {
  Empty,
  Todo,
  Next,
  NextRed,
  Done,
}

const MEDAL_LABEL: Record<Exclude<Medal, null>, string> = {
  worldClass: 'WORLD CLASS',
  gold: 'GOLD',
  silver: 'SILVER',
  bronze: 'BRONZE',
};
const MEDAL_COLOR: Record<Exclude<Medal, null>, string> = {
  worldClass: '#9ff4ff',
  gold: '#ffd23f',
  silver: '#d9dde8',
  bronze: '#e0915a',
};

interface Runner {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  x: number;
  runPhase: number;
  frame: string;
}

function randomSeed(): string {
  try {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => n.toString(16).padStart(8, '0')).join('');
  } catch {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }
}

/**
 * The 100m sprint. This scene only reads simulation state and turns it into
 * pictures and sound; every rule lives in @typlympics/sim.
 */
export class RaceScene extends Phaser.Scene {
  private ruleset: SprintRuleset = rulesetFor('100m');
  private finishX = 0;
  private worldW = 0;
  private store: KeyValueStore | null = null;
  private save!: Save;
  private profile!: Profile;
  private sfx!: Sfx;
  private detach: (() => void) | null = null;

  // Race state.
  private phase: Phase = 'marks';
  private phaseAt = 0;
  private gunDueAt = 0;
  private gunAt = 0;
  private line!: SprintLine;
  private sim!: SprintState;
  private log: InputEvent[] = [];
  private preGun: Array<{ ch: string; ts: number }> = [];
  private stumbleUntil = 0;
  private result: SprintResult | null = null;
  private pbTimeMs: number | null = null;
  private pbTimes: readonly number[] | null = null;
  /** The training rival being raced, or null for a time trial against your own best. */
  private rival: Rival | null = null;
  /** Advance times of whoever runs in the other lane: the rival, or the personal-best ghost. */
  private laneTimes: readonly number[] | null = null;
  private wonAgainstRival = false;
  /** Set for a live online race; null in Train. */
  private online: OnlineRace | null = null;
  private opponents: Opponent[] = [];
  private playerLane = PLAYER_LANE;
  /** The player's flag, carried above their athlete down the track. */
  private playerFlag!: Phaser.GameObjects.Image;
  private lastTickAt = 0;
  private tickBusy = false;
  private official: OfficialResult | null = null;
  private standingsDone = false;
  /** What the race just finished was typed on. */
  private device: Device = 'keyboard';
  private finishedAt = 0;
  private streak = 0;
  private dust: Phaser.GameObjects.Rectangle[] = [];
  private dustNext = 0;
  private speedLines: Phaser.GameObjects.Rectangle[] = [];

  // Display objects.
  private stands!: Phaser.GameObjects.TileSprite;
  private track!: Phaser.GameObjects.TileSprite;
  private player!: Runner;
  private ghost!: Runner;
  private ghostTag!: Phaser.GameObjects.Text;
  private chars: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  /** Two rows of character cells; long races scroll through them line by line. */
  private cells: Phaser.GameObjects.Text[][] = [];
  private cellState: Cell[][] = [];
  private lines: TextLine[] = [];
  private topLine = -1;
  private nextRed = false;
  private timerText!: Phaser.GameObjects.Text;
  private metresText!: Phaser.GameObjects.Text;
  private wpmText!: Phaser.GameObjects.Text;
  private pbText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private panel!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private panelText!: {
    headline: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
    delta: Phaser.GameObjects.Text;
    medal: Phaser.GameObjects.Text;
    stats: Phaser.GameObjects.Text;
    splits: Phaser.GameObjects.Text;
    seed: Phaser.GameObjects.Text;
  };

  constructor() {
    super('race');
  }

  init(data: { event?: string | null; rival?: string | null; online?: OnlineRace }): void {
    this.online = data?.online ?? null;
    this.ruleset = rulesetFor(this.online ? this.online.race.event : data?.event);
    this.rival = this.online ? null : rivalById(data?.rival);
    this.playerLane = this.online?.members.find((m) => m.id === this.online?.you)?.lane ?? PLAYER_LANE;
    this.finishX = START_X + this.ruleset.distance * PX_PER_M;
    this.worldW = this.finishX + 520;
  }

  create(): void {
    ensureTextures(this);
    this.store = browserStore();
    this.save = loadSave(this.store);
    const profile = activeProfile(this.save);
    if (!profile) {
      this.scene.start('login');
      return;
    }
    this.profile = profile;
    // Display objects are rebuilt each time the scene starts.
    this.cells = [];
    this.cellState = [];
    this.dust = [];
    this.speedLines = [];
    this.sfx = new Sfx(this.save.settings.volume);
    this.sfx.unlock();

    this.buildStadium();
    this.player = this.makeRunner(this.playerLane, 1);
    this.playerFlag = this.add.image(0, 0, flagKey(this.profile.nationality)).setOrigin(0.5, 1).setScale(2).setDepth(20 + this.playerLane);
    this.ghost = this.makeRunner(GHOST_LANE, 0.5);
    // Online: one runner per other athlete, in the lane the room gave them.
    this.opponents = [];
    this.official = null;
    this.standingsDone = false;
    this.tickBusy = false;
    if (this.online) {
      for (const m of this.online.members) {
        if (m.id === this.online.you) continue;
        const runner = this.makeRunner(m.lane, 1);
        runner.sprite.setTint(LANE_TINTS[m.lane % LANE_TINTS.length] as number);
        const tag = this.add
          .text(0, 0, m.name, { fontFamily: FONT_MONO, fontSize: '13px', fontStyle: 'bold', color: COLORS.white })
          .setOrigin(0.5, 1)
          .setDepth(20 + m.lane);
        const flag = addFlag(this, 0, 0, m.nationality).setOrigin(1, 1).setDepth(20 + m.lane);
        this.opponents.push({ id: m.id, runner, tag, flag, pos: 0 });
      }
    }
    this.ghost.sprite.setTint(0x9fd0ff);
    this.ghostTag = this.add
      .text(0, 0, 'PB', { fontFamily: FONT_MONO, fontSize: '13px', fontStyle: 'bold', color: COLORS.ice })
      .setOrigin(0.5, 1)
      .setDepth(20 + GHOST_LANE);
    this.buildEffects();
    this.buildHud();
    this.buildPanel();

    this.detach = attachKeyboard(window, {
      onChar: (ch, ts) => this.onChar(ch, ts),
      onControl: (key) => this.onControl(key),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detach?.();
      this.detach = null;
      mobile.hideRaceText();
      mobile.setTextEntry(false);
    });
    mobile.setTextEntry(true);

    this.beginRace();
  }

  // ------------------------------------------------------------ construction

  private buildStadium(): void {
    this.add.image(0, 0, 'sky').setOrigin(0).setScale(2).setScrollFactor(0);
    this.stands = this.add.tileSprite(0, STANDS_TOP, GAME_W, 142, 'stands').setOrigin(0).setScrollFactor(0);
    this.track = this.add
      .tileSprite(0, TRACK_TOP, GAME_W, LANE_H * LANES, 'track')
      .setOrigin(0)
      .setScrollFactor(0);
    this.add.rectangle(0, HUD_TOP - 2, GAME_W, 2, 0xf4e9ff).setOrigin(0).setScrollFactor(0);

    const trackH = LANE_H * LANES;
    // Start line and distance marks: every 10 m in the sprints, every 50 m beyond.
    const distance = this.ruleset.distance;
    const markEvery = distance <= 200 ? 10 : 50;
    this.add.rectangle(START_X, TRACK_TOP, 4, trackH, 0xffffff).setOrigin(0.5, 0);
    for (let m = markEvery; m < distance; m += markEvery) {
      const x = START_X + m * PX_PER_M;
      this.add.rectangle(x, TRACK_TOP, 2, trackH, 0xffffff, 0.3).setOrigin(0.5, 0);
      this.add
        .text(x + 5, TRACK_TOP + 3, `${m}`, { fontFamily: FONT_MONO, fontSize: '12px', fontStyle: 'bold', color: '#f4d6e6' })
        .setAlpha(0.8);
    }
    // Finish line with a gantry.
    this.add.image(this.finishX, TRACK_TOP, 'checker').setOrigin(0.5, 0).setScale(2);
    this.add.rectangle(this.finishX - 70, TRACK_TOP - 58, 6, 62, 0xd9dde8).setOrigin(0.5, 0);
    this.add.rectangle(this.finishX + 70, TRACK_TOP - 58, 6, 62, 0xd9dde8).setOrigin(0.5, 0);
    this.add.rectangle(this.finishX, TRACK_TOP - 58, 160, 26, 0x120824).setStrokeStyle(3, 0xffd23f);
    this.add
      .text(this.finishX, TRACK_TOP - 58, 'FINISH', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.gold })
      .setOrigin(0.5);

    this.cameras.main.setBounds(0, 0, this.worldW, GAME_H);
  }

  private makeRunner(lane: number, alpha: number): Runner {
    const y = laneFeetY(lane);
    const shadow = this.add.image(START_X, y, 'shadow').setOrigin(0.5, 0.5).setScale(3).setDepth(10 + lane).setAlpha(alpha);
    const sprite = this.add.image(START_X, y, 'ath_marks').setOrigin(0.5, 1).setScale(3).setDepth(20 + lane).setAlpha(alpha);
    return { sprite, shadow, x: START_X, runPhase: 0, frame: 'ath_marks' };
  }

  private buildEffects(): void {
    for (let i = 0; i < 12; i++) {
      this.dust.push(this.add.rectangle(0, 0, 4, 4, 0xf4d6e6).setDepth(15 + PLAYER_LANE).setVisible(false));
    }
    for (let i = 0; i < 7; i++) {
      const y = TRACK_TOP - 30 + i * 28;
      this.speedLines.push(
        this.add
          .rectangle((i * 173) % GAME_W, y, 90 + (i % 3) * 40, 2, 0xffffff)
          .setOrigin(0, 0.5)
          .setScrollFactor(0)
          .setDepth(40)
          .setAlpha(0),
      );
    }
  }

  private puffDust(): void {
    const d = this.dust[this.dustNext] as Phaser.GameObjects.Rectangle;
    this.dustNext = (this.dustNext + 1) % this.dust.length;
    const x = this.player.sprite.x - 14;
    const y = laneFeetY(this.playerLane) - 3;
    this.tweens.killTweensOf(d);
    d.setPosition(x, y).setAlpha(0.75).setScale(1).setVisible(true);
    this.tweens.add({ targets: d, x: x - 16, y: y - 8, alpha: 0, scale: 1.8, duration: 280 });
  }

  private buildHud(): void {
    const fixed = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(x: number): T; setDepth(d: number): T }>(o: T): T =>
      o.setScrollFactor(0).setDepth(60);

    fixed(this.add.rectangle(0, HUD_TOP, GAME_W, GAME_H - HUD_TOP, 0x120824).setOrigin(0));
    fixed(this.add.rectangle(0, HUD_TOP, GAME_W, 3, 0xffd23f).setOrigin(0));
    this.cursor = fixed(this.add.rectangle(0, 0, CELL_W - 2, 3, 0xffd23f).setOrigin(0.5, 0));
    for (let row = 0; row < 2; row++) {
      const rowCells: Phaser.GameObjects.Text[] = [];
      for (let col = 0; col < LINE_MAX; col++) {
        rowCells.push(
          fixed(
            this.add
              .text(0, LINE_Y[row] as number, '', { fontFamily: FONT_MONO, fontSize: '26px', fontStyle: 'bold', color: COLORS.white })
              .setOrigin(0.5),
          ),
        );
      }
      this.cells.push(rowCells);
      this.cellState.push(new Array<Cell>(LINE_MAX).fill(Cell.Empty));
    }

    // Scoreboard strip.
    fixed(this.add.rectangle(0, 0, GAME_W, 52, 0x120824, 0.82).setOrigin(0));
    fixed(this.add.rectangle(0, 52, GAME_W, 2, 0xffd23f).setOrigin(0));
    // Event, then the athlete's flag and name. Online the name is left out to keep the strip clear.
    const eventText = fixed(
      this.add
        .text(16, 26, `${eventLabel(this.ruleset.event).replace(' ', '')}${this.online ? ' ONLINE' : ''}`, { fontFamily: FONT_MONO, fontSize: '20px', fontStyle: 'bold', color: COLORS.gold })
        .setOrigin(0, 0.5),
    );
    const flagX = 16 + eventText.width + 12;
    fixed(addFlag(this, flagX, 26, this.profile.nationality));
    if (!this.online) {
      fixed(
        this.add
          .text(flagX + flagWidth() + 8, 26, this.profile.name, { fontFamily: FONT_MONO, fontSize: '20px', fontStyle: 'bold', color: COLORS.white })
          .setOrigin(0, 0.5),
      );
    }
    this.timerText = fixed(
      this.add.text(GAME_W / 2, 27, '0.00', { fontFamily: FONT_DISPLAY, fontSize: '40px', color: COLORS.white }).setOrigin(0.5),
    );
    this.metresText = fixed(
      this.add.text(GAME_W / 2 + 150, 27, '0 m', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.ice }).setOrigin(0.5),
    );
    this.wpmText = fixed(
      this.add.text(GAME_W / 2 - 150, 27, '', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.ice }).setOrigin(0.5),
    );
    this.pbText = fixed(
      this.add.text(GAME_W - 16, 26, '', { fontFamily: FONT_MONO, fontSize: '20px', fontStyle: 'bold', color: COLORS.white }).setOrigin(1, 0.5),
    );

    this.banner = this.add
      .text(GAME_W / 2, 112, '', {
        fontFamily: FONT_DISPLAY,
        fontSize: '64px',
        fontStyle: 'italic',
        color: COLORS.white,
        stroke: COLORS.ink,
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(70);
  }

  private buildPanel(): void {
    const mono = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT_MONO,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      align: 'center',
    });
    const bg = this.add.rectangle(0, 0, 660, 330, 0x120824, 0.96).setStrokeStyle(4, 0xffd23f);
    const headline = this.add.text(0, -136, '', mono(24, COLORS.gold)).setOrigin(0.5);
    const time = this.add
      .text(0, -78, '', { fontFamily: FONT_DISPLAY, fontSize: '92px', color: COLORS.white, stroke: '#3b1d6e', strokeThickness: 8 })
      .setOrigin(0.5);
    const delta = this.add.text(0, -16, '', mono(26, COLORS.white)).setOrigin(0.5);
    const medal = this.add.text(0, 22, '', mono(20, COLORS.gold)).setOrigin(0.5);
    const stats = this.add.text(0, 60, '', mono(18, COLORS.ice)).setOrigin(0.5);
    const splits = this.add.text(0, 88, '', mono(16, COLORS.dim)).setOrigin(0.5);
    const prompt = this.add.text(0, 126, 'ENTER or TAB: RACE AGAIN', mono(22, COLORS.pink)).setOrigin(0.5);
    this.promptText = prompt;
    const seed = this.add.text(0, 152, '', mono(11, '#5a4a80')).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 480, yoyo: true, repeat: -1 });

    this.panel = this.add.container(GAME_W / 2, 250, [bg, headline, time, delta, medal, stats, splits, prompt, seed]);
    this.panel.setDepth(100).setScrollFactor(0, 0, true).setVisible(false);
    this.panelText = { headline, time, delta, medal, stats, splits, seed };
  }

  // ------------------------------------------------------------ race flow

  private beginRace(): void {
    const rec = this.profile.records[this.ruleset.id];
    const times = rec ? verifyRecord(this.ruleset, rec) : null;
    this.pbTimes = times;
    this.pbTimeMs = rec && times ? rec.timeMs : null;

    // Online, every athlete builds the same line from the seed the server issued.
    this.line = generateSprintLine(this.online ? this.online.race.seed : randomSeed(), this.ruleset.distance);
    for (const o of this.opponents) {
      o.pos = 0;
      this.resetRunner(o.runner);
    }
    this.sim = createSprint(this.ruleset, this.line.text);
    this.log = [];
    this.preGun = [];
    this.result = null;
    this.stumbleUntil = 0;
    this.streak = 0;
    this.phase = 'marks';
    this.phaseAt = performance.now();
    mobile.raceBegin();

    // The other lane: a rival typing this line under the same rules, or your own best.
    this.wonAgainstRival = false;
    if (this.rival) {
      const aiLog = generateAiLog(this.rival, this.line.text, this.line.seed, this.ruleset.errorLockoutMs);
      this.laneTimes = simulate(this.ruleset, this.line.text, aiLog).advanceTimes;
      this.ghost.sprite.setTint(this.rival.tint).setAlpha(1);
      this.ghost.shadow.setAlpha(1);
      this.ghostTag.setText(this.rival.name).setColor(COLORS.white);
    } else {
      this.laneTimes = this.pbTimes;
      this.ghost.sprite.setTint(0x9fd0ff).setAlpha(0.5);
      this.ghost.shadow.setAlpha(0.5);
      this.ghostTag.setText('PB').setColor(COLORS.ice);
    }

    this.resetRunner(this.player);
    this.resetRunner(this.ghost);
    const showGhost = this.laneTimes !== null;
    this.ghost.sprite.setVisible(showGhost);
    this.ghost.shadow.setVisible(showGhost);
    this.ghostTag.setVisible(showGhost);
    this.cameras.main.scrollX = 0;

    this.layoutText(this.line.text);
    this.timerText.setText('0.00').setColor(COLORS.white);
    this.metresText.setText('0 m');
    this.wpmText.setText('');
    this.pbText.setText(this.pbTimeMs !== null ? `PB ${formatTime(this.pbTimeMs)}` : 'PB --.--');
    this.panel.setVisible(false);
    this.promptText.setText('ENTER or TAB: RACE AGAIN');
    this.showBanner('ON YOUR MARKS', COLORS.white);
    this.sfx.marks();
  }

  private resetRunner(r: Runner): void {
    r.x = START_X - 8;
    r.runPhase = 0;
    this.setFrame(r, 'ath_marks');
  }

  private fireGun(now: number): void {
    this.gunAt = now;
    this.phase = 'race';
    this.sfx.gun();
    this.cameras.main.flash(90, 255, 255, 255);
    this.profile.totals.races += 1;
    persistSave(this.store, this.save);

    // Keys pressed before the gun enter the log with negative times.
    for (const k of this.preGun) {
      const t = Math.min(-1, Math.round(k.ts - now));
      this.pushInput({ t: Math.max(t, this.finiteLastT()), ch: k.ch });
    }
    this.preGun = [];
    if (this.sim.falseStart) {
      this.stumbleUntil = now + this.sim.lockedUntil;
      this.showBanner('FALSE START', COLORS.red);
    } else {
      this.showBanner('GO!', COLORS.gold, 500);
    }
  }

  private finiteLastT(): number {
    return Number.isFinite(this.sim.lastT) ? this.sim.lastT : Number.NEGATIVE_INFINITY;
  }

  private pushInput(ev: InputEvent): StepKind {
    const kind = applyInput(this.sim, ev);
    this.log.push(ev);
    return kind;
  }

  private onChar(ch: string, ts: number): void {
    this.sfx.unlock();
    if (this.phase === 'marks' || this.phase === 'set') {
      if (this.preGun.length === 0) {
        this.sfx.falseStart();
        this.showBanner('FALSE START', COLORS.red);
      }
      this.preGun.push({ ch, ts });
      return;
    }
    if (this.phase !== 'race') return;

    const t = Math.max(0, Math.round(ts - this.gunAt), this.finiteLastT());
    const kind = this.pushInput({ t, ch });
    switch (kind) {
      case 'advance':
        this.sfx.step();
        this.streak += 1;
        this.puffDust();
        break;
      case 'finish':
        this.sfx.step();
        this.finishRace();
        break;
      case 'error':
        this.sfx.error();
        this.streak = 0;
        this.stumbleUntil = this.gunAt + this.sim.lockedUntil;
        this.cameras.main.shake(110, 0.004);
        break;
      case 'falseStart':
        this.sfx.falseStart();
        this.stumbleUntil = this.gunAt + this.sim.lockedUntil;
        this.showBanner('FALSE START', COLORS.red);
        break;
      default:
        break;
    }
    this.refreshText();
  }

  private onControl(key: ControlKey): void {
    this.sfx.unlock();
    if (this.online) {
      // Online there is no restart: Esc abandons the race, and after the
      // finish every key leads back to the room.
      if (this.phase !== 'result' && key === 'Escape') {
        void onlineApi.submit(this.online.token, this.online.race.id, packLog(this.log), mobile.raceDevice()).catch(() => undefined);
        this.scene.start('lobby', { pin: this.online.pin });
      } else if (this.phase === 'result' && (key === 'Enter' || key === 'Tab' || key === 'Escape')) {
        this.scene.start('lobby', { pin: this.online.pin });
      }
      return;
    }
    if (key === 'Escape') {
      if (this.phase === 'result') this.scene.start('rivals', { event: this.ruleset.event });
      else this.beginRace();
      return;
    }
    if (this.phase === 'result' && (key === 'Enter' || key === 'Tab')) {
      // Enter moves up the ladder after a win; Tab always repeats the same race.
      const next = key === 'Enter' ? this.nextRivalAfterWin() : null;
      if (next) this.rival = next;
      this.beginRace();
    }
  }

  private finishRace(): void {
    this.phase = 'result';
    this.finishedAt = performance.now();
    this.device = mobile.raceDevice();
    mobile.hideRaceText();
    // The official result is recomputed from the log, exactly as a ranked
    // server will do. The live state is only ever a preview of it.
    const official = simulate(this.ruleset, this.line.text, this.log);
    this.result = official;
    const timeMs = official.timeMs as number;

    const previous = this.pbTimeMs;
    const isRecord = previous === null || timeMs < previous;
    this.profile.totals.finishes += 1;
    addToHistory(this.profile, {
      rulesetId: this.ruleset.id,
      timeMs,
      wpm: official.wpm ?? 0,
      accuracy: official.accuracy,
      reactionMs: official.reactionMs,
      errors: official.errors,
      falseStart: official.falseStart,
      device: this.device,
      at: new Date().toISOString(),
    });
    if (isRecord) {
      this.profile.records[this.ruleset.id] = {
        rulesetId: this.ruleset.id,
        timeMs,
        seed: this.line.seed,
        text: this.line.text,
        log: packLog(this.log),
        achievedAt: new Date().toISOString(),
      };
    }
    persistSave(this.store, this.save);

    this.timerText.setText(formatTime(timeMs)).setColor(COLORS.gold);
    this.metresText.setText(`${this.ruleset.distance} m`);
    if (isRecord) this.pbText.setText(`PB ${formatTime(timeMs)}`);
    // Against a rival, the race is won by crossing the line first.
    let sweep = false;
    const rivalTime = this.rival ? ((this.laneTimes?.[this.ruleset.distance - 1] as number | undefined) ?? null) : null;
    if (this.rival && rivalTime !== null) {
      this.wonAgainstRival = timeMs < rivalTime;
      if (this.wonAgainstRival) {
        const before = allRivalsBeaten(rivalsBeatenFor(this.profile, this.ruleset.id));
        markRivalBeaten(this.profile, this.ruleset.id, this.rival.id);
        sweep = !before && allRivalsBeaten(rivalsBeatenFor(this.profile, this.ruleset.id));
        persistSave(this.store, this.save);
      }
    }
    const reference = rivalTime ?? previous;
    const photo = reference !== null && Math.abs(timeMs - reference) < PHOTO_FINISH_MS;
    if (photo) {
      this.showBanner('PHOTO FINISH', COLORS.ice, 900);
      this.cameras.main.flash(160, 255, 255, 255);
    } else {
      this.banner.setVisible(false);
    }
    if (isRecord || sweep || this.wonAgainstRival) this.sfx.record();
    else this.sfx.finish();
    this.fillPanel(official, previous, isRecord);
    if (this.rival && rivalTime !== null) this.fillRivalOutcome(timeMs, rivalTime, isRecord, sweep);
    if (this.online) void this.submitOnline(this.online);
    this.time.delayedCall(photo ? 1100 : 380, () => {
      if (this.phase === 'result' && this.result === official) this.panel.setVisible(true);
    });
  }

  private fillPanel(res: SprintResult, previousPb: number | null, isRecord: boolean): void {
    const p = this.panelText;
    const timeMs = res.timeMs as number;
    const signed = (ms: number): string => `${ms < 0 ? '-' : '+'}${formatTime(Math.abs(ms))}`;

    p.headline.setText(isRecord ? 'NEW PERSONAL BEST!' : 'FINISH').setColor(isRecord ? COLORS.gold : COLORS.ice);
    p.time.setText(formatTime(timeMs));

    if (previousPb === null) {
      p.delta.setText('FIRST TIME ON THE BOARD').setColor(COLORS.ice);
    } else {
      const d = timeMs - previousPb;
      const margin = `${(Math.abs(d) / 1000).toFixed(3)} s`;
      if (Math.abs(d) < PHOTO_FINISH_MS) {
        p.delta.setText(d < 0 ? `PHOTO FINISH: ${margin} AHEAD OF YOUR BEST` : d === 0 ? 'PHOTO FINISH: DEAD HEAT WITH YOUR BEST' : `PHOTO FINISH: ${margin} BEHIND YOUR BEST`);
      } else {
        p.delta.setText(d < 0 ? `${signed(d)}  FASTER THAN YOUR BEST` : `${signed(d)}  OFF YOUR BEST`);
      }
      p.delta.setColor(d < 0 ? COLORS.green : COLORS.red);
    }

    const medal = medalFor(this.ruleset, timeMs);
    const m = this.ruleset.medalsMs;
    const ladder: Array<[Exclude<Medal, null>, number]> = [
      ['bronze', m.bronze],
      ['silver', m.silver],
      ['gold', m.gold],
      ['worldClass', m.worldClass],
    ];
    const next = ladder.find(([, limit]) => timeMs > limit);
    const nextText = next ? `NEXT: ${MEDAL_LABEL[next[0]]} AT ${formatTime(next[1])}` : 'TOP TIER REACHED';
    p.medal
      .setText(medal ? `${MEDAL_LABEL[medal]} MEDAL   ${nextText}` : nextText)
      .setColor(medal ? MEDAL_COLOR[medal] : COLORS.dim);

    const reaction = res.reactionMs !== null ? (res.reactionMs / 1000).toFixed(3) : '-';
    p.stats.setText(
      `REACTION ${reaction}${res.falseStart ? ' (FALSE START)' : ''}   WPM ${Math.round(res.wpm ?? 0)}   ACCURACY ${(res.accuracy * 100).toFixed(1)}%`,
    );

    const pb = this.pbTimes;
    // With four splits the last one is the finish time already shown above.
    const shown = res.splits.length > 3 ? res.splits.slice(0, -1) : res.splits;
    p.splits.setText(
      shown
        .map((s) => {
          const ref = pb?.[s.mark - 1];
          const diff = ref !== undefined && previousPb !== null ? ` (${signed(s.tMs - ref)})` : '';
          return `${s.mark}m ${formatTime(s.tMs)}${diff}`;
        })
        .join('   '),
    );
    p.seed.setText(`ruleset ${res.rulesetId}  seed ${this.line.seed}  ${this.device}  esc: menu`);
  }

  // ------------------------------------------------------------ online

  /**
   * Sends the keystroke log to the server, which works out the official
   * result, then keeps the standings up to date until everyone is in.
   */
  private async submitOnline(race: OnlineRace): Promise<void> {
    const p = this.panelText;
    p.headline.setText('SENDING YOUR RACE TO THE SERVER . . .').setColor(COLORS.ice);
    p.medal.setText('').setColor(COLORS.ice);
    this.promptText.setText('ENTER: BACK TO THE ROOM');
    try {
      this.official = await onlineApi.submit(race.token, race.race.id, packLog(this.log), this.device);
    } catch (e) {
      if (!this.scene.isActive()) return;
      p.headline.setText('RESULT NOT RECORDED').setColor(COLORS.red);
      p.medal.setText(e instanceof Error ? e.message.toUpperCase() : 'THE SERVER COULD NOT BE REACHED').setColor(COLORS.red);
      return;
    }
    let polls = 0;
    const poll = async (): Promise<void> => {
      if (!this.scene.isActive() || this.standingsDone) return;
      polls += 1;
      try {
        const res = await onlineApi.results(race.token, race.race.id);
        if (!this.scene.isActive()) return;
        this.showStandings(race, res.entries, res.done);
        if (res.done || polls >= RESULT_POLLS_MAX) this.standingsDone = true;
      } catch {
        // A missed poll is harmless; the next one catches up.
      }
    };
    await poll();
    this.time.addEvent({ delay: RESULT_POLL_MS, repeat: RESULT_POLLS_MAX, callback: () => void poll() });
  }

  private showStandings(race: OnlineRace, entries: Standing[], done: boolean): void {
    const p = this.panelText;
    const me = entries.find((e) => e.id === race.you);
    const official = this.official;
    if (official?.status === 'review') {
      p.headline.setText('RESULT HELD FOR REVIEW').setColor(COLORS.red);
    } else if (me?.place) {
      p.headline.setText(`${ordinal(me.place)} PLACE${done ? '' : ' SO FAR'}${official?.personalBest ? '   ONLINE BEST!' : ''}`).setColor(me.place === 1 ? COLORS.gold : COLORS.ice);
    } else {
      p.headline.setText('DID NOT FINISH').setColor(COLORS.ice);
    }
    p.medal
      .setText(done ? `OFFICIAL TIME ${official?.timeMs != null ? formatTime(official.timeMs) : '--.--'}` : 'WAITING FOR THE OTHER ATHLETES . . .')
      .setColor(done ? COLORS.gold : COLORS.ice);
    const line = (e: Standing): string =>
      `${e.place ? ordinal(e.place) : e.status === 'racing' ? '...' : 'DNF'} ${e.nationality} ${e.name} ${e.timeMs != null && e.place ? formatTime(e.timeMs) : ''}`.trim();
    p.stats.setText(entries.slice(0, 2).map(line).join('     '));
    p.splits.setText(entries.slice(2, 4).map(line).join('     ')).setColor(COLORS.ice);
  }

  /** Reports progress and reads everyone else's, a few times a second. */
  private async tickOnline(race: OnlineRace): Promise<void> {
    this.tickBusy = true;
    try {
      const positions = await onlineApi.tick(race.token, race.race.id, this.sim.pos);
      for (const pos of positions) {
        const o = this.opponents.find((x) => x.id === pos.id);
        if (o) o.pos = Math.max(o.pos, pos.status === 'finished' ? this.ruleset.distance : pos.pos);
      }
    } catch {
      // Opponents simply hold position until the next tick gets through.
    } finally {
      this.tickBusy = false;
    }
  }

  /** Rewrites the headline, margin and prompt of the result panel for a race against a rival. */
  private fillRivalOutcome(timeMs: number, rivalTime: number, isRecord: boolean, sweep: boolean): void {
    const rival = this.rival as Rival;
    const p = this.panelText;
    const margin = `${(Math.abs(timeMs - rivalTime) / 1000).toFixed(Math.abs(timeMs - rivalTime) < PHOTO_FINISH_MS ? 3 : 2)} s`;
    const best = isRecord ? '  NEW BEST!' : '';
    if (sweep) {
      p.headline.setText('MEET CHAMPION!  ALL RIVALS BEATEN').setColor(COLORS.gold);
    } else if (this.wonAgainstRival) {
      p.headline.setText(`YOU BEAT ${rival.name}!${best}`).setColor(COLORS.gold);
    } else {
      p.headline.setText(`${rival.name} WINS${best}`).setColor(isRecord ? COLORS.gold : COLORS.ice);
    }
    if (timeMs === rivalTime) p.delta.setText(`DEAD HEAT WITH ${rival.name}`).setColor(COLORS.ice);
    else if (this.wonAgainstRival) p.delta.setText(`${margin} AHEAD OF ${rival.name}`).setColor(COLORS.green);
    else p.delta.setText(`${margin} BEHIND ${rival.name}`).setColor(COLORS.red);

    const next = this.nextRivalAfterWin();
    this.promptText.setText(next ? `ENTER: FACE ${next.name}     TAB: RACE AGAIN` : 'ENTER or TAB: RACE AGAIN');
  }

  /** After a win, the next rival up the ladder, if there is one. */
  private nextRivalAfterWin(): Rival | null {
    if (!this.rival || !this.wonAgainstRival) return null;
    return RIVALS[RIVALS.indexOf(this.rival) + 1] ?? null;
  }

  // ------------------------------------------------------------ text band

  private layoutText(text: string): void {
    this.lines = wrapLines(text, LINE_MAX);
    this.topLine = -1;
    this.nextRed = false;
    this.refreshText();
  }

  /** Repaints the two visible rows. Only cells whose state changed are touched. */
  private refreshText(): void {
    const pos = this.sim.pos;
    const text = this.line.text;
    // On a phone the same text is also shown large, above the phone keyboard.
    if (mobile.enabled && this.phase !== 'result') mobile.setRaceText(text, pos, this.nextRed);
    const top = topLineFor(this.lines, pos);
    const scrolled = top !== this.topLine;
    this.topLine = top;
    let cursorSet = false;

    for (let row = 0; row < 2; row++) {
      const line = this.lines[top + row];
      const len = line ? line.end - line.start : 0;
      const x0 = (GAME_W - len * CELL_W) / 2 + CELL_W / 2;
      const rowCells = this.cells[row] as Phaser.GameObjects.Text[];
      const rowState = this.cellState[row] as Cell[];
      for (let col = 0; col < LINE_MAX; col++) {
        const cell = rowCells[col] as Phaser.GameObjects.Text;
        if (!line || col >= len) {
          if (rowState[col] !== Cell.Empty) {
            cell.setText('');
            rowState[col] = Cell.Empty;
          }
          continue;
        }
        const index = line.start + col;
        const state = index < pos ? Cell.Done : index === pos ? (this.nextRed ? Cell.NextRed : Cell.Next) : Cell.Todo;
        if (scrolled) {
          cell.setText(text[index] as string);
          cell.x = Math.round(x0 + col * CELL_W);
        }
        if (scrolled || rowState[col] !== state) {
          cell.setColor(state === Cell.Done ? COLORS.dim : state === Cell.Next ? COLORS.gold : state === Cell.NextRed ? COLORS.red : COLORS.white);
          rowState[col] = state;
        }
        if (index === pos) {
          this.cursor.setVisible(true).setPosition(cell.x, cell.y + 14);
          this.cursor.setFillStyle(this.nextRed ? 0xff5566 : 0xffd23f);
          cursorSet = true;
        }
      }
    }
    if (!cursorSet) this.cursor.setVisible(false);
  }

  private showBanner(text: string, color: string, fadeAfterMs?: number): void {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setColor(color).setAlpha(1).setVisible(true);
    if (fadeAfterMs !== undefined) {
      this.tweens.add({ targets: this.banner, alpha: 0, delay: fadeAfterMs, duration: 250 });
    }
  }

  // ------------------------------------------------------------ frame update

  override update(_time: number, deltaMs: number): void {
    const now = performance.now();
    const dt = Math.min(0.05, deltaMs / 1000);

    // On a phone, a Train race waits on its marks until the keyboard is open.
    if (!this.online && this.phase === 'marks' && mobile.needsKeyboardTap()) {
      this.phaseAt = now;
      if (this.banner.text !== 'TAP TO START') this.showBanner('TAP TO START', COLORS.gold);
    } else if (this.phase === 'marks' && this.banner.text === 'TAP TO START') {
      this.showBanner('ON YOUR MARKS', COLORS.white);
    }

    // Online the server sets the gun time; in Train it is a random wait after "set".
    const setDue = this.online ? now >= this.online.gunAt - MARKS_MS : now - this.phaseAt >= MARKS_MS;
    if (this.phase === 'marks' && setDue) {
      this.phase = 'set';
      this.gunDueAt = this.online ? this.online.gunAt : now + GUN_DELAY_MIN_MS + Math.random() * (GUN_DELAY_MAX_MS - GUN_DELAY_MIN_MS);
      if (this.preGun.length === 0) this.showBanner('SET', COLORS.orange);
      this.sfx.set();
    } else if (this.phase === 'set' && now >= this.gunDueAt) {
      this.fireGun(now);
      this.refreshText();
    }

    const stumbling = this.phase === 'race' && now < this.stumbleUntil;
    if (stumbling !== this.nextRed) {
      this.nextRed = stumbling;
      this.refreshText();
      if (!stumbling && this.banner.text === 'FALSE START') this.banner.setVisible(false);
    }

    if (this.phase === 'race') {
      const elapsed = now - this.gunAt;
      this.timerText.setText(formatTime(elapsed));
      this.metresText.setText(`${this.sim.pos} m`);
      if (this.sim.pos >= 5 && elapsed > 0) {
        this.wpmText.setText(`${Math.round(this.sim.pos / 5 / (elapsed / 60000))} WPM`);
      }
    }

    // Player athlete.
    const finished = this.phase === 'result';
    const playerTarget = START_X - 8 + this.sim.pos * PX_PER_M + (finished ? 110 : 0);
    const moved = this.advanceRunner(this.player, playerTarget, dt);
    let frame: string;
    if (this.phase === 'marks') frame = 'ath_marks';
    else if (this.phase === 'set') frame = 'ath_set';
    else if (stumbling) frame = 'ath_stumble';
    else if (finished && now - this.finishedAt < DIP_MS) frame = 'ath_dip';
    else if (moved / dt > 30) frame = this.runFrame(this.player, !finished && this.sim.pos <= DRIVE_METRES);
    else if (finished) frame = 'ath_win';
    else frame = this.sim.pos === 0 ? 'ath_set' : 'ath_run1';
    this.setFrame(this.player, frame);

    this.playerFlag.setPosition(this.player.sprite.x, this.player.sprite.y - 100);

    // Personal-best ghost, replayed from its own keystroke log.
    if (this.laneTimes) {
      const started = this.phase === 'race' || this.phase === 'result';
      const gpos = started ? positionAt(this.laneTimes, now - this.gunAt) : 0;
      const ghostDone = gpos >= this.ruleset.distance;
      const gTarget = START_X - 8 + gpos * PX_PER_M + (ghostDone ? 110 : 0);
      const gMoved = this.advanceRunner(this.ghost, gTarget, dt);
      let gFrame: string;
      if (this.phase === 'marks') gFrame = 'ath_marks';
      else if (this.phase === 'set' || gpos === 0) gFrame = 'ath_set';
      else if (gMoved / dt > 30) gFrame = this.runFrame(this.ghost);
      else gFrame = ghostDone ? 'ath_idle' : 'ath_run1';
      this.setFrame(this.ghost, gFrame);
      this.ghostTag.setPosition(this.ghost.sprite.x, this.ghost.sprite.y - 98);
    }

    // Speed lines for a clean streak. They never affect the race.
    const intensity =
      this.phase === 'race' ? Phaser.Math.Clamp((this.streak - STREAK_START) / (STREAK_FULL - STREAK_START), 0, 1) : 0;
    for (const line of this.speedLines) {
      line.setAlpha(intensity * 0.45);
      if (intensity > 0) {
        line.x -= dt * 1400;
        if (line.x < -line.width) line.x = GAME_W + Math.random() * 200;
      }
    }

    // Online opponents, eased toward the last position the server relayed.
    if (this.online) {
      const racing = this.phase === 'race' || (this.phase === 'result' && !this.standingsDone);
      if (racing && !this.tickBusy && now - this.lastTickAt > TICK_MS) {
        this.lastTickAt = now;
        void this.tickOnline(this.online);
      }
      for (const o of this.opponents) {
        const done = o.pos >= this.ruleset.distance;
        const oMoved = this.advanceRunner(o.runner, START_X - 8 + o.pos * PX_PER_M + (done ? 110 : 0), dt);
        let oFrame: string;
        if (this.phase === 'marks') oFrame = 'ath_marks';
        else if (this.phase === 'set' || o.pos === 0) oFrame = 'ath_set';
        else if (oMoved / dt > 30) oFrame = this.runFrame(o.runner);
        else oFrame = done ? 'ath_idle' : 'ath_run1';
        this.setFrame(o.runner, oFrame);
        o.tag.setPosition(o.runner.sprite.x + flagWidth() / 2 + 2, o.runner.sprite.y - 98);
        o.flag.setPosition(o.tag.x - o.tag.width / 2 - 4, o.tag.y - 1);
      }
    }

    // Camera and parallax.
    const cam = this.cameras.main;
    cam.scrollX = Phaser.Math.Clamp(this.player.x - 300, 0, this.worldW - GAME_W);
    this.stands.tilePositionX = Math.round(cam.scrollX * 0.5);
    this.track.tilePositionX = Math.round(cam.scrollX);
  }

  /** Eases a runner toward its target x and returns the distance moved. */
  private advanceRunner(r: Runner, target: number, dt: number): number {
    const before = r.x;
    r.x += (target - r.x) * (1 - Math.exp(-dt * 14));
    if (Math.abs(target - r.x) < 0.2) r.x = target;
    const moved = r.x - before;
    r.runPhase += moved / 13;
    r.sprite.x = Math.round(r.x);
    r.shadow.x = r.sprite.x;
    return moved;
  }

  private runFrame(r: Runner, drive = false): string {
    const frames = drive ? DRIVE_FRAMES : RUN_FRAMES;
    return frames[Math.floor(r.runPhase) % frames.length] as string;
  }

  private setFrame(r: Runner, frame: string): void {
    if (r.frame === frame) return;
    r.frame = frame;
    r.sprite.setTexture(frame);
  }
}
