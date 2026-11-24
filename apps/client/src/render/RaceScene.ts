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
  SPRINT_100M_V1,
  applyInput,
  createSprint,
  formatTime,
  medalFor,
  positionAt,
  simulate,
  type InputEvent,
  type Medal,
  type SprintResult,
  type SprintState,
  type StepKind,
} from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard, type ControlKey } from '../input/keyboard';
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
  FINISH_X,
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
  WORLD_W,
  laneFeetY,
} from './layout';
import { portraitKey, preloadPortraits } from './portraits';
import { ensureTextures } from './textures';

type Phase = 'marks' | 'set' | 'race' | 'result';

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
  private readonly ruleset = SPRINT_100M_V1;
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
  private markedTo = 0;
  private nextRed = false;
  private timerText!: Phaser.GameObjects.Text;
  private metresText!: Phaser.GameObjects.Text;
  private wpmText!: Phaser.GameObjects.Text;
  private pbText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private panel!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private rivalPortrait!: Phaser.GameObjects.Image;
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

  init(data: { rival?: string | null }): void {
    this.rival = rivalById(data?.rival);
  }

  preload(): void {
    preloadPortraits(this);
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
    this.chars = [];
    this.dust = [];
    this.speedLines = [];
    this.sfx = new Sfx(this.save.settings.volume);
    this.sfx.unlock();

    this.buildStadium();
    this.player = this.makeRunner(PLAYER_LANE, 1);
    this.ghost = this.makeRunner(GHOST_LANE, 0.5);
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
    });

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
    // Start line and 10 m marks.
    this.add.rectangle(START_X, TRACK_TOP, 4, trackH, 0xffffff).setOrigin(0.5, 0);
    for (let m = 10; m < 100; m += 10) {
      const x = START_X + m * PX_PER_M;
      this.add.rectangle(x, TRACK_TOP, 2, trackH, 0xffffff, 0.3).setOrigin(0.5, 0);
      this.add
        .text(x + 5, TRACK_TOP + 3, `${m}`, { fontFamily: FONT_MONO, fontSize: '12px', fontStyle: 'bold', color: '#f4d6e6' })
        .setAlpha(0.8);
    }
    // Finish line with a gantry.
    this.add.image(FINISH_X, TRACK_TOP, 'checker').setOrigin(0.5, 0).setScale(2);
    this.add.rectangle(FINISH_X - 70, TRACK_TOP - 58, 6, 62, 0xd9dde8).setOrigin(0.5, 0);
    this.add.rectangle(FINISH_X + 70, TRACK_TOP - 58, 6, 62, 0xd9dde8).setOrigin(0.5, 0);
    this.add.rectangle(FINISH_X, TRACK_TOP - 58, 160, 26, 0x120824).setStrokeStyle(3, 0xffd23f);
    this.add
      .text(FINISH_X, TRACK_TOP - 58, 'FINISH', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.gold })
      .setOrigin(0.5);

    this.cameras.main.setBounds(0, 0, WORLD_W, GAME_H);
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
    const y = laneFeetY(PLAYER_LANE) - 3;
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
    for (let i = 0; i < this.ruleset.distance; i++) {
      this.chars.push(
        fixed(
          this.add
            .text(0, 0, ' ', { fontFamily: FONT_MONO, fontSize: '26px', fontStyle: 'bold', color: COLORS.white })
            .setOrigin(0.5),
        ),
      );
    }

    // Scoreboard strip.
    fixed(this.add.rectangle(0, 0, GAME_W, 52, 0x120824, 0.82).setOrigin(0));
    fixed(this.add.rectangle(0, 52, GAME_W, 2, 0xffd23f).setOrigin(0));
    fixed(
      this.add.text(16, 26, `100M  ${this.profile.nationality} ${this.profile.name}`, { fontFamily: FONT_MONO, fontSize: '20px', fontStyle: 'bold', color: COLORS.gold }).setOrigin(0, 0.5),
    );
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
    this.rivalPortrait = this.add.image(-268, -72, portraitKey('turtle')).setDisplaySize(88, 88).setVisible(false);
    const seed = this.add.text(0, 152, '', mono(11, '#5a4a80')).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 480, yoyo: true, repeat: -1 });

    this.panel = this.add.container(GAME_W / 2, 250, [bg, headline, time, delta, medal, stats, splits, prompt, seed, this.rivalPortrait]);
    this.panel.setDepth(100).setScrollFactor(0, 0, true).setVisible(false);
    this.panelText = { headline, time, delta, medal, stats, splits, seed };
  }

  // ------------------------------------------------------------ race flow

  private beginRace(): void {
    const rec = this.profile.records[this.ruleset.id];
    const times = rec ? verifyRecord(this.ruleset, rec) : null;
    this.pbTimes = times;
    this.pbTimeMs = rec && times ? rec.timeMs : null;

    this.line = generateSprintLine(randomSeed(), this.ruleset.distance);
    this.sim = createSprint(this.ruleset, this.line.text);
    this.log = [];
    this.preGun = [];
    this.result = null;
    this.stumbleUntil = 0;
    this.streak = 0;
    this.phase = 'marks';
    this.phaseAt = performance.now();

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
    this.rivalPortrait.setVisible(false);
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
    if (key === 'Escape') {
      if (this.phase === 'result') this.scene.start('rivals');
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
    this.metresText.setText('100 m');
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
    p.splits.setText(
      res.splits
        .map((s) => {
          const ref = pb?.[s.mark - 1];
          const diff = ref !== undefined && previousPb !== null ? ` (${signed(s.tMs - ref)})` : '';
          return `${s.mark}m ${formatTime(s.tMs)}${diff}`;
        })
        .join('   '),
    );
    p.seed.setText(`ruleset ${res.rulesetId}  seed ${this.line.seed}  esc: menu`);
  }

  /** Rewrites the headline, margin and prompt of the result panel for a race against a rival. */
  private fillRivalOutcome(timeMs: number, rivalTime: number, isRecord: boolean, sweep: boolean): void {
    const rival = this.rival as Rival;
    const p = this.panelText;
    const margin = `${(Math.abs(timeMs - rivalTime) / 1000).toFixed(Math.abs(timeMs - rivalTime) < PHOTO_FINISH_MS ? 3 : 2)} s`;
    const best = isRecord ? '  NEW BEST!' : '';
    this.rivalPortrait.setTexture(portraitKey(rival.id)).setDisplaySize(88, 88).setVisible(true);
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
    // Break into two lines at the space nearest the middle.
    const mid = Math.floor(text.length / 2);
    let split = -1;
    for (let d = 0; d < text.length; d++) {
      if (text[mid + d] === ' ') {
        split = mid + d;
        break;
      }
      if (text[mid - d] === ' ') {
        split = mid - d;
        break;
      }
    }
    const firstLen = split < 0 ? text.length : split + 1;
    for (let i = 0; i < this.chars.length; i++) {
      const obj = this.chars[i] as Phaser.GameObjects.Text;
      const lineIndex = i < firstLen ? 0 : 1;
      const col = lineIndex === 0 ? i : i - firstLen;
      const len = lineIndex === 0 ? firstLen : text.length - firstLen;
      const x = (GAME_W - len * CELL_W) / 2 + CELL_W / 2 + col * CELL_W;
      obj.setPosition(Math.round(x), LINE_Y[lineIndex] as number);
      obj.setText(text[i] ?? ' ');
      obj.setColor(COLORS.white);
    }
    this.markedTo = 0;
    this.nextRed = false;
    this.refreshText();
  }

  private refreshText(): void {
    const pos = this.sim.pos;
    for (let i = this.markedTo; i < pos; i++) this.chars[i]?.setColor(COLORS.dim);
    this.markedTo = pos;
    const next = this.chars[pos];
    if (next) {
      next.setColor(this.nextRed ? COLORS.red : COLORS.gold);
      this.cursor.setVisible(true).setPosition(next.x, next.y + 14);
      this.cursor.setFillStyle(this.nextRed ? 0xff5566 : 0xffd23f);
    } else {
      this.cursor.setVisible(false);
    }
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

    if (this.phase === 'marks' && now - this.phaseAt >= MARKS_MS) {
      this.phase = 'set';
      this.gunDueAt = now + GUN_DELAY_MIN_MS + Math.random() * (GUN_DELAY_MAX_MS - GUN_DELAY_MIN_MS);
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

    // Camera and parallax.
    const cam = this.cameras.main;
    cam.scrollX = Phaser.Math.Clamp(this.player.x - 300, 0, WORLD_W - GAME_W);
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
