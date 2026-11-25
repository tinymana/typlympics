import Phaser from 'phaser';
import { EVENT_IDS, RULESETS, eventLabel, formatTime, type EventId } from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard, type ControlKey } from '../input/keyboard';
import { mobile } from '../input/mobile';
import { OnlineError, gunTimeFrom, online, type Records, type RoomAnswer, type RoomState } from '../net/online';
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

    const detach = attachKeyboard(window, { onChar: (ch) => this.onChar(ch), onControl: (key) => void this.onControl(key) });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
    this.refresh();
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
    this.add.text(225, 380, 'Others: COMPETE, JOIN A RACE,\nthen type this PIN.', mono(13, COLORS.ice, { align: 'center' })).setOrigin(0.5);

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
    addFooter(this, 'ESC  LEAVE THE ROOM');

    const detach = attachKeyboard(window, { onChar: () => undefined, onControl: (key) => void this.onControl(key) });
    const timer = this.time.addEvent({ delay: POLL_MS, loop: true, callback: () => void this.poll() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      detach();
      timer.remove();
    });
    void this.poll();
  }

  private token(): string {
    return this.ctx.profile.online?.token ?? '';
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

/** World Records: the all-time boards, straight from the server. */
export class RecordsScene extends Phaser.Scene {
  private eventIndex = 0;
  private board: Records | null = null;
  /** Which board is showing. Keyboard and phone results are ranked apart. */
  private phone = false;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super('records');
  }

  create(): void {
    if (!context(this)) return;
    ensureTextures(this);
    this.objects = [];
    this.board = null;
    this.phone = mobile.enabled;
    addBackdrop(this);
    addHeading(this, 'WORLD RECORDS', 'ALL-TIME BESTS FROM ONLINE RACES, KEYBOARD AND PHONE RANKED APART');
    addPanel(this, 30, 106, 520, 380);
    addPanel(this, 570, 106, 360, 184, false);
    addPanel(this, 570, 302, 360, 184, false);
    this.status = this.add.text(290, 290, 'LOADING . . .', mono(20, COLORS.pink)).setOrigin(0.5);
    addFooter(this, 'LEFT / RIGHT  DISTANCE     UP / DOWN  KEYBOARD OR PHONE     ESC  BACK');

    const detach = attachKeyboard(window, {
      onChar: () => undefined,
      onControl: (key) => {
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          this.phone = !this.phone;
          this.draw();
        } else if (key === 'Escape' || key === 'Backspace' || (key === 'Enter' && this.board)) this.scene.start('title');
        else if (key === 'Enter') void this.fetchBoards();
        else if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const dir = key === 'ArrowRight' ? 1 : -1;
          this.eventIndex = (this.eventIndex + dir + EVENT_IDS.length) % EVENT_IDS.length;
          this.draw();
        }
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
    void this.fetchBoards();
  }

  private async fetchBoards(): Promise<void> {
    this.status.setText('LOADING . . .').setVisible(true);
    try {
      const data = await online.records();
      if (!this.scene.isActive()) return;
      this.board = data;
      this.draw();
    } catch (e) {
      if (this.scene.isActive()) this.status.setText(`${message(e)}\n\nENTER: TRY AGAIN`).setAlign('center');
    }
  }

  private put<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj);
    return obj;
  }

  private draw(): void {
    const data = this.board;
    if (!data) return;
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.status.setVisible(false);

    const event = EVENT_IDS[this.eventIndex] as EventId;
    const rows = (this.phone ? data.phoneBoards : data.boards)[RULESETS[event].id] ?? [];
    const speed = this.phone ? data.phoneTopSpeed : data.topSpeed;
    this.put(this.add.text(46, 116, `◀  ${eventLabel(event)}  ▶   ${this.phone ? 'PHONE' : 'KEYBOARD'}`, mono(20, COLORS.gold)));
    this.put(this.add.text(534, 120, '▲▼ SWITCH', mono(12, COLORS.dim)).setOrigin(1, 0));
    this.put(this.add.text(46, 150, '#', mono(12, COLORS.dim)));
    this.put(this.add.text(84, 150, 'ATHLETE', mono(12, COLORS.dim)));
    this.put(this.add.text(430, 150, 'TIME', mono(12, COLORS.dim)).setOrigin(1, 0));
    this.put(this.add.text(534, 150, 'WPM', mono(12, COLORS.dim)).setOrigin(1, 0));
    if (rows.length === 0) {
      this.put(this.add.text(290, 300, 'NO TIMES YET.\nHOST A RACE AND SET THE FIRST.', mono(16, COLORS.dim, { align: 'center' })).setOrigin(0.5));
    }
    const medal = [COLORS.gold, '#d9dde8', '#e0915a'];
    rows.slice(0, 10).forEach((r, i) => {
      const y = 172 + i * 30;
      const color = medal[i] ?? COLORS.white;
      this.put(this.add.text(46, y, `${r.rank}`, mono(18, color)));
      this.put(addFlag(this, 84, y + 10, r.nationality));
      this.put(this.add.text(84 + flagWidth() + 8, y, r.name, mono(18, color)));
      this.put(this.add.text(430, y, formatTime(r.timeMs), mono(18, color)).setOrigin(1, 0));
      this.put(this.add.text(534, y, `${Math.round(r.wpm)}`, mono(18, COLORS.ice)).setOrigin(1, 0));
    });

    this.put(this.add.text(586, 114, `TOP SPEED, ${this.phone ? 'PHONE' : 'KEYBOARD'}`, mono(15, COLORS.gold)));
    speed.slice(0, 5).forEach((r, i) => {
      const y = 144 + i * 27;
      this.put(this.add.text(586, y, `${i + 1}`, mono(15, COLORS.white)));
      this.put(addFlag(this, 606, y + 9, r.nationality, 1.5));
      this.put(this.add.text(642, y, r.name, mono(15, COLORS.white)));
      this.put(this.add.text(914, y, `${Math.round(r.wpm)} WPM`, mono(15, COLORS.ice)).setOrigin(1, 0));
    });
    if (speed.length === 0) this.put(this.add.text(750, 200, 'NO RACES YET', mono(14, COLORS.dim)).setOrigin(0.5));

    this.put(this.add.text(586, 310, 'MOST RACE WINS', mono(15, COLORS.gold)));
    data.mostWins.slice(0, 5).forEach((r, i) => {
      const y = 340 + i * 27;
      this.put(this.add.text(586, y, `${i + 1}`, mono(15, COLORS.white)));
      this.put(addFlag(this, 606, y + 9, r.nationality, 1.5));
      this.put(this.add.text(642, y, r.name, mono(15, COLORS.white)));
      this.put(this.add.text(914, y, `${r.wins}`, mono(15, COLORS.ice)).setOrigin(1, 0));
    });
    if (data.mostWins.length === 0) this.put(this.add.text(750, 396, 'NO WINS YET', mono(14, COLORS.dim)).setOrigin(0.5));
  }
}
