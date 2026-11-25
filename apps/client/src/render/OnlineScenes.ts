import Phaser from 'phaser';
import { EVENT_IDS, RULESETS, eventLabel, formatTime, type EventId } from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard, type ControlKey } from '../input/keyboard';
import { mobile } from '../input/mobile';
import { hasPendingInvite, sendInvite, takePendingInvite } from '../net/invite';
import {
  MEDAL_COLORS,
  MEDAL_NAMES,
  OnlineError,
  countdown,
  gunTimeFrom,
  monthLabel,
  online,
  weekLabel,
  type BoardRow,
  type Hall,
  type Records,
  type RoomAnswer,
  type RoomState,
  type Weekly,
} from '../net/online';
import { GUEST_ID, PIN_LENGTH, activeProfile, browserStore, checkPin, loadSave, persistSave, type KeyValueStore, type Profile, type Save } from '../storage/save';
import { COLORS, GAME_W } from './layout';
import { addFlag, flagKey, flagWidth } from './flags';
import { ensureTextures } from './textures';
import { addBackdrop, addFooter, addHeading, addPanel, mono } from './ui';

export const ROOM_PIN_LENGTH = 5;
const POLL_MS = 1000;

/** Races this browser has already run, so returning to the room does not restart one. */
const racesRun = new Set<string>();
export function markRaceRun(raceId: string): void {
  racesRun.add(raceId);
}

function message(e: unknown): string {
  return (e instanceof OnlineError ? e.message : 'Something went wrong. Try again.').toUpperCase();
}

interface Ctx {
  store: KeyValueStore | null;
  save: Save;
  profile: Profile;
}

function context(scene: Phaser.Scene): Ctx | null {
  const store = browserStore();
  const save = loadSave(store);
  const profile = activeProfile(save);
  if (!profile) {
    scene.scene.start('login');
    return null;
  }
  return { store, save, profile };
}

// ------------------------------------------------------------------ COMPETE

type Step = 'guest' | 'pin' | 'menu' | 'host' | 'join' | 'busy';

/**
 * Compete: go online with your PIN, then host a race or join one by its
 * room PIN. Up to four athletes race on the same gun and the server works
 * out the result from each athlete's keystrokes.
 */
export class CompeteScene extends Phaser.Scene {
  private ctx!: Ctx;
  private sfx!: Sfx;
  private step: Step = 'menu';
  private typed = '';
  private menuIndex = 0;
  private eventIndex = 0;
  private title!: Phaser.GameObjects.Text;
  private value!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private startNote = '';

  constructor() {
    super('compete');
  }

  init(data: { note?: string }): void {
    this.startNote = data?.note ?? '';
  }

  create(): void {
    const ctx = context(this);
    if (!ctx) return;
    this.ctx = ctx;
    ensureTextures(this);
    this.sfx = new Sfx(ctx.save.settings.volume);
    this.typed = '';

    addBackdrop(this);
    addHeading(this, 'COMPETE', `${ctx.profile.name}   ·   UP TO 4 ATHLETES`);
    addPanel(this, 180, 120, 600, 300);
    this.title = this.add.text(GAME_W / 2, 160, '', mono(22, COLORS.gold)).setOrigin(0.5);
    this.value = this.add.text(GAME_W / 2, 250, '', mono(44, COLORS.white, { align: 'center' })).setOrigin(0.5);
    this.hint = this.add.text(GAME_W / 2, 350, '', mono(15, COLORS.ice, { align: 'center' })).setOrigin(0.5);
    this.note = this.add.text(GAME_W / 2, 450, this.startNote, mono(16, COLORS.red)).setOrigin(0.5);
    addFooter(this, 'ENTER  CONFIRM     ESC  BACK');

    if (ctx.profile.id === GUEST_ID) this.step = 'guest';
    else this.step = ctx.profile.online ? 'menu' : 'pin';
    if (hasPendingInvite()) {
      if (this.step === 'guest') {
        takePendingInvite();
        this.note.setText('SIGN IN AS AN ATHLETE TO JOIN THAT RACE');
      } else if (this.step === 'pin') {
        this.note.setText('YOU HAVE AN INVITE: ENTER YOUR PIN TO JOIN').setColor(COLORS.gold);
      }
    }

    const detach = attachKeyboard(window, { onChar: (ch) => this.onChar(ch), onControl: (key) => void this.onControl(key) });
    // PIN entry: tapping the game opens the keyboard.
    mobile.setTextEntry(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      detach();
      mobile.setTextEntry(false);
    });
    this.refresh();
    if (this.step === 'menu') void this.joinInvite();
  }

  /** Joins the room from an invite link, once the athlete is online. */
  private async joinInvite(): Promise<void> {
    const pin = takePendingInvite();
    const token = this.ctx.profile.online?.token;
    if (!pin || !token) return;
    await this.run(async () => {
      const answer = await online.join(token, pin);
      this.scene.start('lobby', { pin: answer.room.pin });
    }, 'menu');
  }

  private onChar(ch: string): void {
    this.sfx.unlock();
    const max = this.step === 'pin' ? PIN_LENGTH : this.step === 'join' ? ROOM_PIN_LENGTH : 0;
    if (max && /^[0-9]$/.test(ch) && this.typed.length < max) {
      this.typed += ch;
      this.note.setText('');
      this.sfx.step();
      this.refresh();
    }
  }

  private async onControl(key: ControlKey): Promise<void> {
    this.sfx.unlock();
    if (this.step === 'busy') return;
    if (key === 'Backspace' && this.typed.length > 0) {
      this.typed = this.typed.slice(0, -1);
    } else if (key === 'Escape' || key === 'Backspace') {
      if (this.step === 'host' || this.step === 'join') this.step = 'menu';
      else {
        this.scene.start('title');
        return;
      }
      this.typed = '';
      this.note.setText('');
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (this.step === 'menu') this.menuIndex = 1 - this.menuIndex;
      this.sfx.step();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (this.step === 'host') {
        const dir = key === 'ArrowRight' ? 1 : -1;
        this.eventIndex = (this.eventIndex + dir + EVENT_IDS.length) % EVENT_IDS.length;
        this.sfx.step();
      }
    } else if (key === 'Enter' || key === 'Tab') {
      await this.confirm();
      return;
    }
    this.refresh();
  }

  private async confirm(): Promise<void> {
    const { profile } = this.ctx;
    if (this.step === 'guest') return;
    if (this.step === 'menu') {
      this.step = this.menuIndex === 0 ? 'host' : 'join';
      this.typed = '';
      this.sfx.marks();
      this.refresh();
      return;
    }
    if (this.step === 'pin') {
      if (this.typed.length !== PIN_LENGTH || !checkPin(profile, this.typed)) {
        this.fail('WRONG PIN');
        return;
      }
      const pin = this.typed;
      await this.run(async () => {
        const res = await online.enter(profile.name, profile.nationality, pin);
        profile.online = { token: res.token, athleteId: res.athlete.id };
        persistSave(this.ctx.store, this.ctx.save);
        this.step = 'menu';
      }, 'pin');
      // The step changes inside the task above, which the type checker cannot see.
      if ((this.step as Step) === 'menu') await this.joinInvite();
      return;
    }
    const token = profile.online?.token;
    if (!token) {
      this.step = 'pin';
      this.refresh();
      return;
    }
    if (this.step === 'host') {
      await this.run(async () => {
        const answer = await online.host(token, EVENT_IDS[this.eventIndex] as EventId);
        this.scene.start('lobby', { pin: answer.room.pin });
      }, 'host');
    } else if (this.step === 'join') {
      if (this.typed.length !== ROOM_PIN_LENGTH) {
        this.fail(`A ROOM PIN IS ${ROOM_PIN_LENGTH} DIGITS`);
        return;
      }
      const pin = this.typed;
      await this.run(async () => {
        const answer = await online.join(token, pin);
        this.scene.start('lobby', { pin: answer.room.pin });
      }, 'join');
    }
  }

  /** Runs a server call with a busy state, returning to `back` on failure. */
  private async run(task: () => Promise<void>, back: Step): Promise<void> {
    this.step = 'busy';
    this.refresh();
    try {
      await task();
    } catch (e) {
      if (e instanceof OnlineError && e.code === 'signed_out') {
        this.ctx.profile.online = null;
        persistSave(this.ctx.store, this.ctx.save);
        back = 'pin';
      }
      this.step = back;
      this.typed = '';
      this.fail(message(e));
      return;
    }
    if (this.scene.isActive()) {
      this.typed = '';
      this.refresh();
    }
  }

  private fail(text: string): void {
    this.note.setText(text);
    this.sfx.error();
    this.refresh();
  }

  private refresh(): void {
    const dots = (len: number): string => ('● '.repeat(this.typed.length) + '○ '.repeat(len - this.typed.length)).trim();
    switch (this.step) {
      case 'guest':
        this.title.setText('ATHLETES ONLY');
        this.value.setText('GUEST CANNOT COMPETE').setFontSize(30);
        this.hint.setText('Switch athlete on the title screen and sign in with a name and PIN.\nYour online record is kept under that name.');
        break;
      case 'pin':
        this.title.setText('ENTER YOUR PIN TO GO ONLINE');
        this.value.setText(dots(PIN_LENGTH)).setFontSize(44);
        this.hint.setText('Your name, nationality and PIN become your online athlete.\nThe same PIN signs you in from any computer.');
        break;
      case 'menu':
        this.title.setText('ONLINE');
        this.value.setText(`${this.menuIndex === 0 ? '▶ ' : '  '}HOST A RACE\n${this.menuIndex === 1 ? '▶ ' : '  '}JOIN A RACE`).setFontSize(34);
        this.hint.setText('Host to get a room PIN for your friends, or join with theirs.');
        break;
      case 'host':
        this.title.setText('HOST: CHOOSE THE DISTANCE');
        this.value.setText(`◀  ${eventLabel(EVENT_IDS[this.eventIndex] as EventId)}  ▶`).setFontSize(44);
        this.hint.setText('LEFT / RIGHT to change.  ENTER opens the room.');
        break;
      case 'join':
        this.title.setText('JOIN: TYPE THE ROOM PIN');
        this.value.setText(dots(ROOM_PIN_LENGTH)).setFontSize(44);
        this.hint.setText('Ask the host for the five-digit PIN on their screen.');
        break;
      case 'busy':
        this.title.setText('CONNECTING');
        this.value.setText('. . .').setFontSize(44);
        this.hint.setText('');
        break;
    }
  }
}

// ------------------------------------------------------------------ LOBBY

/** The race room: shows the PIN, who is in which lane, and starts the race. */
export class LobbyScene extends Phaser.Scene {
  private ctx!: Ctx;
  private sfx!: Sfx;
  private pin = '';
  private room: RoomState | null = null;
  private you = '';
  private eventIndex = 0;
  /** A room poll is in flight. */
  private polling = false;
  /** The host has pressed start and the server has not answered yet. */
  private starting = false;
  private leaving = false;
  private lanes: Array<{ name: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text; flag: Phaser.GameObjects.Image }> = [];
  private eventText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private inviteText!: Phaser.GameObjects.Text;

  constructor() {
    super('lobby');
  }

  init(data: { pin: string }): void {
    this.pin = data.pin;
  }

  create(): void {
    const ctx = context(this);
    if (!ctx) return;
    this.ctx = ctx;
    ensureTextures(this);
    this.sfx = new Sfx(ctx.save.settings.volume);
    this.room = null;
    this.polling = false;
    this.starting = false;
    this.leaving = false;
    this.lanes = [];

    addBackdrop(this);
    addHeading(this, 'RACE ROOM', 'SHARE THIS PIN WITH UP TO THREE FRIENDS');
    addPanel(this, 60, 110, 330, 300);
    this.add.text(225, 134, 'ROOM PIN', mono(18, COLORS.gold)).setOrigin(0.5);
    this.add.text(225, 210, this.pin.split('').join(' '), mono(54, COLORS.white)).setOrigin(0.5);
    this.add.text(225, 286, 'DISTANCE', mono(14, COLORS.dim)).setOrigin(0.5);
    this.eventText = this.add.text(225, 322, '', mono(30, COLORS.gold)).setOrigin(0.5);
    this.inviteText = this.add
      .text(225, 380, mobile.enabled ? 'Tap INVITE to text a friend\na link to this room.' : 'Press I to copy an invite link,\nor tell friends the PIN.', mono(13, COLORS.ice, { align: 'center' }))
      .setOrigin(0.5);

    addPanel(this, 410, 110, 490, 300, false);
    this.add.text(430, 122, 'LANES', mono(18, COLORS.gold));
    for (let i = 0; i < 4; i++) {
      const y = 166 + i * 58;
      this.add.rectangle(430, y - 20, 450, 46, 0x2a1458).setOrigin(0).setStrokeStyle(2, 0x5b3aa6);
      this.add.text(446, y + 3, `${i + 1}`, mono(24, COLORS.dim)).setOrigin(0, 0.5);
      this.lanes.push({
        flag: addFlag(this, 486, y + 3, 'USA').setVisible(false),
        name: this.add.text(486, y + 3, '', mono(20, COLORS.white)).setOrigin(0, 0.5),
        tag: this.add.text(866, y + 3, '', mono(13, COLORS.gold)).setOrigin(1, 0.5),
      });
    }
    this.status = this.add.text(GAME_W / 2, 440, 'CONNECTING . . .', mono(20, COLORS.pink)).setOrigin(0.5);
    this.note = this.add.text(GAME_W / 2, 474, '', mono(14, COLORS.red)).setOrigin(0.5);
    addFooter(this, mobile.enabled ? 'INVITE  TEXT A FRIEND     ESC  LEAVE THE ROOM' : 'I  COPY INVITE LINK     ESC  LEAVE THE ROOM');

    const detach = attachKeyboard(window, {
      onChar: (ch) => {
        if (ch === 'i') void this.invite();
      },
      onControl: (key) => void this.onControl(key),
    });
    const timer = this.time.addEvent({ delay: POLL_MS, loop: true, callback: () => void this.poll() });
    // On a phone the keyboard is put away so the Invite button is in reach.
    mobile.closeKeyboard();
    mobile.setAction('INVITE', () => void this.invite());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      detach();
      timer.remove();
      mobile.setAction(null);
    });
    void this.poll();
  }

  private token(): string {
    return this.ctx.profile.online?.token ?? '';
  }

  /** Shares or copies a link that brings a friend straight to this room. */
  private async invite(): Promise<void> {
    const outcome = await sendInvite(this.pin, mobile.enabled);
    if (!this.scene.isActive()) return;
    const text = {
      shared: 'INVITE SENT',
      copied: 'INVITE COPIED: PASTE IT INTO A MESSAGE',
      cancelled: '',
      failed: `COULD NOT COPY. TELL THEM THE PIN: ${this.pin}`,
    }[outcome];
    if (text) this.inviteText.setText(text).setColor(outcome === 'failed' ? COLORS.red : COLORS.gold);
  }

  private async poll(): Promise<void> {
    if (this.polling || this.starting || this.leaving) return;
    this.polling = true;
    try {
      const answer = await online.room(this.token(), this.pin);
      // A start that happened while this poll was in flight is newer than it.
      if (!this.starting) this.apply(answer);
    } catch (e) {
      if (e instanceof OnlineError && ['not_member', 'no_room', 'signed_out'].includes(e.code)) {
        if (this.scene.isActive()) this.scene.start('compete', { note: message(e) });
      } else if (this.scene.isActive()) {
        this.note.setText(message(e));
      }
    } finally {
      this.polling = false;
    }
  }

  private apply(answer: RoomAnswer): void {
    if (!this.scene.isActive() || this.leaving) return;
    const first = this.room === null;
    this.room = answer.room;
    this.you = answer.you;
    if (first) this.eventIndex = Math.max(0, EVENT_IDS.indexOf(answer.room.event as EventId));
    this.note.setText('');

    const race = answer.room.race;
    const gunAt = gunTimeFrom(answer);
    if (answer.room.state === 'racing' && race && gunAt !== null && !racesRun.has(race.id)) {
      markRaceRun(race.id);
      this.scene.start('race', {
        online: { pin: this.pin, token: this.token(), you: this.you, race, gunAt, members: answer.room.members },
      });
      return;
    }
    this.refresh();
  }

  private async onControl(key: ControlKey): Promise<void> {
    this.sfx.unlock();
    const room = this.room;
    if (key === 'Escape') {
      this.leaving = true;
      try {
        await online.leave(this.token(), this.pin);
      } catch {
        // Leaving is best effort; the server drops silent members on its own.
      }
      this.scene.start('compete');
      return;
    }
    if (!room || room.hostId !== this.you || room.state === 'racing') return;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = key === 'ArrowRight' ? 1 : -1;
      this.eventIndex = (this.eventIndex + dir + EVENT_IDS.length) % EVENT_IDS.length;
      this.sfx.step();
      this.refresh();
    } else if ((key === 'Enter' || key === 'Tab') && !this.starting) {
      this.starting = true;
      this.status.setText('STARTING . . .');
      try {
        const answer = await online.start(this.token(), this.pin, EVENT_IDS[this.eventIndex] as EventId);
        this.starting = false;
        this.apply(answer);
      } catch (e) {
        this.starting = false;
        this.note.setText(message(e));
        this.sfx.error();
      }
    }
  }

  private refresh(): void {
    const room = this.room;
    if (!room) return;
    const isHost = room.hostId === this.you;
    const event = (isHost ? EVENT_IDS[this.eventIndex] : room.event) as EventId;
    this.eventText.setText(isHost ? `◀ ${eventLabel(event)} ▶` : eventLabel(event));
    this.lanes.forEach((lane, i) => {
      const m = room.members.find((x) => x.lane === i);
      lane.flag.setVisible(!!m);
      if (m) lane.flag.setTexture(flagKey(m.nationality));
      lane.name
        .setText(m ? m.name : 'OPEN')
        .setX(m ? 486 + flagWidth() + 10 : 486)
        .setColor(m ? COLORS.white : COLORS.dim);
      lane.tag.setText(m ? [m.id === room.hostId ? 'HOST' : '', m.id === this.you ? 'YOU' : ''].filter(Boolean).join('  ') : '');
    });
    if (room.state === 'racing') this.status.setText('RACE IN PROGRESS: YOU ARE IN THE NEXT ONE');
    else if (isHost) this.status.setText(room.members.length < 2 ? 'ENTER: START ALONE, OR WAIT FOR OTHERS' : `ENTER: START THE ${eventLabel(event).replace(' ', '')}`);
    else this.status.setText('WAITING FOR THE HOST TO START');
  }
}

// ------------------------------------------------------------------ WORLD RECORDS

type View = 'week' | 'alltime' | 'hall';
const VIEWS: readonly View[] = ['week', 'alltime', 'hall'];
const VIEW_TITLE: Record<View, string> = { week: 'THIS WEEK', alltime: 'ALL TIME', hall: 'HALL OF FAME' };

/**
 * World Records: three boards from online races.
 *  - This week: the running standings; the top three hold the medal spots.
 *  - All time: the fastest times ever.
 *  - Hall of fame: every weekly medal, by month, and the medal table.
 * Keyboard and phone results are always ranked apart.
 */
export class RecordsScene extends Phaser.Scene {
  private eventIndex = 0;
  private phone = false;
  private view: View = 'week';
  private monthIndex = 0;
  private allTime: Records | null = null;
  private week: Weekly | null = null;
  private hallData: Hall | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;

  constructor() {
    super('records');
  }

  create(): void {
    if (!context(this)) return;
    ensureTextures(this);
    this.objects = [];
    this.allTime = null;
    this.week = null;
    this.hallData = null;
    this.view = 'week';
    this.monthIndex = 0;
    this.phone = mobile.enabled;
    addBackdrop(this);
    addHeading(this, 'WORLD RECORDS');
    this.subtitle = this.add.text(GAME_W / 2, 84, '', mono(16, COLORS.ice)).setOrigin(0.5);
    addPanel(this, 30, 106, 520, 380);
    addPanel(this, 570, 106, 360, 184, false);
    addPanel(this, 570, 302, 360, 184, false);
    this.status = this.add.text(290, 290, 'LOADING . . .', mono(20, COLORS.pink, { align: 'center' })).setOrigin(0.5);
    addFooter(this, 'ENTER  NEXT BOARD     ◀ ▶  DISTANCE OR MONTH     ▲ ▼  KEYBOARD / PHONE     ESC  BACK');

    const detach = attachKeyboard(window, {
      onChar: () => undefined,
      onControl: (key) => {
        if (key === 'Escape' || key === 'Backspace') {
          this.scene.start('title');
        } else if (key === 'Enter' || key === 'Tab') {
          this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length] as View;
          void this.show();
        } else if (key === 'ArrowUp' || key === 'ArrowDown') {
          this.phone = !this.phone;
          this.draw();
        } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const dir = key === 'ArrowRight' ? 1 : -1;
          if (this.view === 'hall') void this.changeMonth(-dir);
          else {
            this.eventIndex = (this.eventIndex + dir + EVENT_IDS.length) % EVENT_IDS.length;
            this.draw();
          }
        }
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
    void this.show();
  }

  private hasData(): boolean {
    return this.view === 'week' ? this.week !== null : this.view === 'alltime' ? this.allTime !== null : this.hallData !== null;
  }

  /** Loads the current view's data if it is not here yet, then draws it. */
  private async show(): Promise<void> {
    const view = this.view;
    this.subtitle.setText(`${VIEW_TITLE[view]}   ·   KEYBOARD AND PHONE RANKED APART`);
    if (!this.hasData()) {
      this.clear();
      this.status.setText('LOADING . . .').setVisible(true);
      try {
        if (view === 'week') this.week = await online.weekly();
        else if (view === 'alltime') this.allTime = await online.records();
        else this.hallData = await online.hall();
      } catch (e) {
        if (this.scene.isActive() && this.view === view) this.status.setText(`${message(e)}\n\nENTER: NEXT BOARD`);
        return;
      }
    }
    if (this.scene.isActive() && this.view === view) this.draw();
  }

  private async changeMonth(step: number): Promise<void> {
    const hall = this.hallData;
    if (!hall || hall.months.length === 0) return;
    const next = Phaser.Math.Clamp(this.monthIndex + step, 0, hall.months.length - 1);
    if (next === this.monthIndex) return;
    this.monthIndex = next;
    try {
      this.hallData = await online.hall(hall.months[next]);
    } catch (e) {
      this.status.setText(message(e)).setVisible(true);
      return;
    }
    if (this.scene.isActive()) this.draw();
  }

  private put<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj);
    return obj;
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  private draw(): void {
    if (!this.hasData()) return;
    this.clear();
    this.status.setVisible(false);
    if (this.view === 'week') this.drawWeek(this.week as Weekly);
    else if (this.view === 'alltime') this.drawAllTime(this.allTime as Records);
    else this.drawHall(this.hallData as Hall);
  }

  private deviceName(): string {
    return this.phone ? 'PHONE' : 'KEYBOARD';
  }

  /** The main board: rank, flag, name, time, WPM. Top three in medal colours. */
  private drawBoard(title: string, rows: BoardRow[], empty: string): void {
    this.put(this.add.text(46, 116, title, mono(19, COLORS.gold)));
    this.put(this.add.text(46, 150, '#', mono(12, COLORS.dim)));
    this.put(this.add.text(84, 150, 'ATHLETE', mono(12, COLORS.dim)));
    this.put(this.add.text(430, 150, 'TIME', mono(12, COLORS.dim)).setOrigin(1, 0));
    this.put(this.add.text(534, 150, 'WPM', mono(12, COLORS.dim)).setOrigin(1, 0));
    if (rows.length === 0) this.put(this.add.text(290, 300, empty, mono(16, COLORS.dim, { align: 'center' })).setOrigin(0.5));
    rows.slice(0, 10).forEach((r, i) => {
      const y = 172 + i * 30;
      const color = MEDAL_COLORS[r.rank - 1] ?? COLORS.white;
      this.put(this.add.text(46, y, `${r.rank}`, mono(18, color)));
      this.put(addFlag(this, 84, y + 10, r.nationality));
      this.put(this.add.text(84 + flagWidth() + 8, y, r.name, mono(18, color)));
      this.put(this.add.text(430, y, formatTime(r.timeMs), mono(18, color)).setOrigin(1, 0));
      this.put(this.add.text(534, y, `${Math.round(r.wpm)}`, mono(18, COLORS.ice)).setOrigin(1, 0));
    });
  }

  /** A short list in one of the right-hand panels. */
  private drawSide(top: number, title: string, lines: Array<{ flag?: string; left: string; right: string; color?: string }>, empty: string): void {
    this.put(this.add.text(586, top + 8, title, mono(15, COLORS.gold)));
    if (lines.length === 0) this.put(this.add.text(750, top + 96, empty, mono(13, COLORS.dim, { align: 'center' })).setOrigin(0.5));
    lines.slice(0, 5).forEach((l, i) => {
      const y = top + 38 + i * 27;
      if (l.flag) this.put(addFlag(this, 586, y + 9, l.flag, 1.5));
      this.put(this.add.text(l.flag ? 622 : 586, y, l.left, mono(15, l.color ?? COLORS.white)));
      this.put(this.add.text(914, y, l.right, mono(15, COLORS.ice)).setOrigin(1, 0));
    });
  }

  private drawWeek(week: Weekly): void {
    const event = EVENT_IDS[this.eventIndex] as EventId;
    const rulesetId = RULESETS[event].id;
    const rows = (this.phone ? week.phoneBoards : week.boards)[rulesetId] ?? [];
    this.drawBoard(
      `◀ ${eventLabel(event)} ▶  ${this.deviceName()}  ·  ENDS IN ${countdown(week.endsInMs)}`,
      rows,
      'NO TIMES THIS WEEK YET.\nRACE ONLINE TO TAKE A MEDAL SPOT.',
    );
    const device = this.phone ? 'phone' : 'keyboard';
    const last = week.lastWeek;
    const medals = last ? last.medals.filter((m) => m.rulesetId === rulesetId && m.device === device) : [];
    this.drawSide(
      106,
      last ? `LAST WEEK'S MEDALS (${weekLabel(last.weekStart)})` : "LAST WEEK'S MEDALS",
      medals.map((m) => ({ flag: m.nationality, left: `${MEDAL_NAMES[m.rank - 1] ?? ''}  ${m.name}`, right: formatTime(m.timeMs), color: MEDAL_COLORS[m.rank - 1] })),
      last ? 'NO MEDALS AT THIS DISTANCE\nLAST WEEK' : 'THE FIRST MEDALS ARE AWARDED\nWHEN THIS WEEK ENDS',
    );
    this.put(this.add.text(586, 310, 'HOW MEDALS WORK', mono(15, COLORS.gold)));
    this.put(
      this.add.text(
        586,
        338,
        `Week of ${weekLabel(week.weekStart)}, Monday to Sunday (UTC).\nYour best online time each week counts.\nTop three at each distance take gold,\nsilver and bronze when the week ends.\nKeyboard and phone have their own medals.`,
        mono(13, COLORS.ice, { lineSpacing: 6 }),
      ),
    );
  }

  private drawAllTime(data: Records): void {
    const event = EVENT_IDS[this.eventIndex] as EventId;
    const rows = (this.phone ? data.phoneBoards : data.boards)[RULESETS[event].id] ?? [];
    const speed = this.phone ? data.phoneTopSpeed : data.topSpeed;
    this.drawBoard(`◀ ${eventLabel(event)} ▶  ${this.deviceName()}  ·  FASTEST EVER`, rows, 'NO TIMES YET.\nHOST A RACE AND SET THE FIRST.');
    this.drawSide(
      106,
      `TOP SPEED, ${this.deviceName()}`,
      speed.map((r, i) => ({ flag: r.nationality, left: `${i + 1}  ${r.name}`, right: `${Math.round(r.wpm)} WPM` })),
      'NO RACES YET',
    );
    this.drawSide(
      302,
      'MOST RACE WINS',
      data.mostWins.map((r, i) => ({ flag: r.nationality, left: `${i + 1}  ${r.name}`, right: `${r.wins}` })),
      'NO WINS YET',
    );
  }

  private drawHall(hall: Hall): void {
    const event = EVENT_IDS[this.eventIndex] as EventId;
    const rulesetId = RULESETS[event].id;
    const device = this.phone ? 'phone' : 'keyboard';
    const month = hall.month;
    this.put(this.add.text(46, 116, month ? `◀ ${monthLabel(month)} ▶  ${eventLabel(event)}  ${this.deviceName()}` : 'HALL OF FAME', mono(19, COLORS.gold)));
    const medals = hall.medals.filter((m) => m.rulesetId === rulesetId && m.device === device);
    if (medals.length === 0) {
      this.put(
        this.add
          .text(290, 300, month ? `NO ${eventLabel(event)} ${this.deviceName()} MEDALS\nIN ${monthLabel(month)}.\n\nENTER: THIS WEEK'S BOARD HAS THE DISTANCE PICKER` : 'NO MEDALS HAVE BEEN AWARDED YET.\nTHE FIRST WEEK ENDS SOON.', mono(15, COLORS.dim, { align: 'center' }))
          .setOrigin(0.5),
      );
    }
    this.put(this.add.text(46, 150, 'WEEK OF', mono(12, COLORS.dim)));
    this.put(this.add.text(150, 150, 'MEDAL', mono(12, COLORS.dim)));
    this.put(this.add.text(244, 150, 'ATHLETE', mono(12, COLORS.dim)));
    this.put(this.add.text(534, 150, 'TIME', mono(12, COLORS.dim)).setOrigin(1, 0));
    medals.slice(0, 12).forEach((m, i) => {
      const y = 172 + i * 25;
      const color = MEDAL_COLORS[m.rank - 1] ?? COLORS.white;
      this.put(this.add.text(46, y, weekLabel(m.weekStart), mono(15, COLORS.ice)));
      this.put(this.add.text(150, y, MEDAL_NAMES[m.rank - 1] ?? '', mono(15, color)));
      this.put(addFlag(this, 244, y + 9, m.nationality, 1.5));
      this.put(this.add.text(280, y, m.name, mono(15, color)));
      this.put(this.add.text(534, y, formatTime(m.timeMs), mono(15, color)).setOrigin(1, 0));
    });
    this.drawSide(
      106,
      'MEDAL TABLE, ALL TIME',
      hall.medalTable.map((r) => ({ flag: r.nationality, left: r.name, right: `${r.gold}G ${r.silver}S ${r.bronze}B` })),
      'NO MEDALS YET',
    );
    this.put(this.add.text(586, 310, 'BROWSING', mono(15, COLORS.gold)));
    this.put(
      this.add.text(
        586,
        338,
        `Left and right change the month.\nUp and down switch keyboard and phone.\nThe distance is the one chosen on the\nother boards (${eventLabel(event)}).\n${hall.months.length} month${hall.months.length === 1 ? '' : 's'} on record.`,
        mono(13, COLORS.ice, { lineSpacing: 6 }),
      ),
    );
  }
}
