import Phaser from 'phaser';
import { nameAllowed } from '@typlympics/content';
import { SPRINT_100M_V1, formatTime } from '@typlympics/sim';
import { Sfx } from '../audio/sfx';
import { attachKeyboard, type ControlKey } from '../input/keyboard';
import { mobile } from '../input/mobile';
import { COUNTRIES, DEFAULT_COUNTRY_INDEX, countryName, findCountry } from '../storage/countries';
import {
  GUEST_ID,
  NAME_MAX,
  PIN_LENGTH,
  browserStore,
  checkPin,
  createProfile,
  ensureGuest,
  findProfile,
  loadSave,
  normalizeName,
  persistSave,
  randomSalt,
  verifyRecord,
  type KeyValueStore,
  type Profile,
  type Save,
} from '../storage/save';
import { COLORS, FONT_DISPLAY, FONT_MONO, GAME_H, GAME_W, STANDS_TOP } from './layout';
import { addFlag, flagKey, flagWidth } from './flags';
import { ensureTextures } from './textures';

type Step = 'name' | 'nation' | 'pin';
const MAX_PIN_TRIES = 3;
const TYPE_AHEAD_MS = 900;

/**
 * Athlete sign-in, arcade style: name, nationality, four-digit PIN.
 * A known name asks for its PIN and loads that athlete's records; a new
 * name picks a nationality and sets a PIN. Everything is stored on this
 * device only.
 */
export class LoginScene extends Phaser.Scene {
  private store: KeyValueStore | null = null;
  private save!: Save;
  private sfx!: Sfx;
  private detach: (() => void) | null = null;

  private step: Step = 'name';
  private existing: Profile | null = null;
  private nameText = '';
  private countryIndex = DEFAULT_COUNTRY_INDEX;
  private pinText = '';
  private pinTries = 0;
  private typeAhead = '';
  private typeAheadAt = 0;

  private rows!: Record<Step, { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; box: Phaser.GameObjects.Rectangle }>;
  private heading!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private panel!: Phaser.GameObjects.Rectangle;
  private nationFlag!: Phaser.GameObjects.Image;

  constructor() {
    super('login');
  }

  create(data: { switch?: boolean }): void {
    this.store = browserStore();
    this.save = loadSave(this.store);
    // Already signed in on this device: go straight to the title screen.
    if (!data?.switch && this.save.activeProfileId) {
      this.scene.start('title');
      return;
    }

    ensureTextures(this);
    this.sfx = new Sfx(this.save.settings.volume);
    this.step = 'name';
    this.existing = null;
    this.nameText = '';
    this.pinText = '';
    this.pinTries = 0;
    this.countryIndex = DEFAULT_COUNTRY_INDEX;

    this.add.image(0, 0, 'sky').setOrigin(0).setScale(2);
    this.add.tileSprite(0, STANDS_TOP, GAME_W, 142, 'stands').setOrigin(0);
    this.add.tileSprite(0, 292, GAME_W, 160, 'track').setOrigin(0);
    this.add.rectangle(0, 452, GAME_W, 88, 0x120824).setOrigin(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x120824, 0.45).setOrigin(0);

    this.buildForm();
    this.buildRoster();

    this.detach = attachKeyboard(window, {
      onChar: (ch) => this.onChar(ch),
      onControl: (key) => this.onControl(key),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.detach?.();
      this.detach = null;
      mobile.setTextEntry(false);
    });
    // Tapping anywhere on the sign-in form opens the keyboard.
    mobile.setTextEntry(true);
    this.refresh();
  }

  // ------------------------------------------------------------ layout

  private buildForm(): void {
    const cx = 330;
    this.panel = this.add.rectangle(cx, 268, 560, 400, 0x120824, 0.95).setStrokeStyle(4, 0xffd23f);
    this.add
      .text(cx, 96, 'ATHLETE SIGN-IN', {
        fontFamily: FONT_DISPLAY,
        fontSize: '44px',
        fontStyle: 'italic',
        color: COLORS.gold,
        stroke: COLORS.ink,
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.heading = this.add
      .text(cx, 140, '', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.ice })
      .setOrigin(0.5);

    const makeRow = (y: number, label: string) => {
      const box = this.add.rectangle(cx, y + 14, 500, 62, 0x2a1458, 1).setStrokeStyle(3, 0x5b3aa6);
      const l = this.add
        .text(cx - 236, y - 8, label, { fontFamily: FONT_MONO, fontSize: '14px', fontStyle: 'bold', color: COLORS.dim })
        .setOrigin(0, 0.5);
      const v = this.add
        .text(cx - 236, y + 22, '', { fontFamily: FONT_MONO, fontSize: '30px', fontStyle: 'bold', color: COLORS.white })
        .setOrigin(0, 0.5);
      return { label: l, value: v, box };
    };
    this.rows = {
      name: makeRow(182, 'NAME'),
      nation: makeRow(256, 'NATIONALITY'),
      pin: makeRow(330, 'PIN'),
    };

    // The flag sits at the left of the nationality row; its text is indented to make room.
    this.nationFlag = addFlag(this, cx - 236, 278, 'USA', 2).setVisible(false);
    this.rows.nation.value.setX(cx - 236 + flagWidth() + 12);

    this.message = this.add
      .text(cx, 396, '', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.red })
      .setOrigin(0.5);
    this.hint = this.add
      .text(cx, 432, '', { fontFamily: FONT_MONO, fontSize: '15px', color: COLORS.ice, align: 'center' })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, 500, 'Records are kept on this device. The PIN keeps other players on this computer out of your record.\nIt is not a secure password: do not reuse a PIN you use anywhere else.', {
        fontFamily: FONT_MONO,
        fontSize: '13px',
        color: COLORS.dim,
        align: 'center',
      })
      .setOrigin(0.5);
  }

  private buildRoster(): void {
    const x = 790;
    this.add.rectangle(x, 268, 300, 400, 0x120824, 0.95).setStrokeStyle(4, 0x5b3aa6);
    this.add
      .text(x, 92, 'ON THIS DEVICE', { fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold', color: COLORS.gold })
      .setOrigin(0.5);
    const profiles = Object.values(this.save.profiles)
      .filter((p) => p.id !== GUEST_ID)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
    if (profiles.length === 0) {
      this.add
        .text(x, 200, 'No athletes yet.\n\nType a name to\ncreate the first.', {
          fontFamily: FONT_MONO,
          fontSize: '16px',
          color: COLORS.dim,
          align: 'center',
        })
        .setOrigin(0.5);
    }
    profiles.forEach((p, i) => {
      const y = 132 + i * 38;
      const rec = p.records[SPRINT_100M_V1.id];
      const best = rec && verifyRecord(SPRINT_100M_V1, rec) ? formatTime(rec.timeMs) : '--.--';
      addFlag(this, x - 134, y, p.nationality);
      this.add.text(x - 90, y, p.name, { fontFamily: FONT_MONO, fontSize: '16px', fontStyle: 'bold', color: COLORS.white }).setOrigin(0, 0.5);
      this.add.text(x + 132, y, best, { fontFamily: FONT_MONO, fontSize: '15px', color: COLORS.ice }).setOrigin(1, 0.5);
    });
    this.add
      .text(x, 446, 'Type GUEST to play\nwithout a PIN', { fontFamily: FONT_MONO, fontSize: '13px', color: COLORS.dim, align: 'center' })
      .setOrigin(0.5);
  }

  // ------------------------------------------------------------ input

  private onChar(ch: string): void {
    this.sfx.unlock();
    this.message.setText('');
    if (this.step === 'name') {
      if (/^[a-z0-9 ]$/.test(ch) && this.nameText.length < NAME_MAX) {
        if (ch === ' ' && (this.nameText.length === 0 || this.nameText.endsWith(' '))) return;
        this.nameText += ch.toUpperCase();
        this.sfx.step();
      }
    } else if (this.step === 'nation') {
      if (/^[a-z ]$/.test(ch)) {
        const now = performance.now();
        this.typeAhead = now - this.typeAheadAt > TYPE_AHEAD_MS ? ch : this.typeAhead + ch;
        this.typeAheadAt = now;
        const found = findCountry(this.typeAhead);
        if (found >= 0) {
          this.countryIndex = found;
          this.sfx.step();
        }
      }
    } else if (/^[0-9]$/.test(ch) && this.pinText.length < PIN_LENGTH) {
      this.pinText += ch;
      this.sfx.step();
    }
    this.refresh();
  }

  private onControl(key: ControlKey): void {
    this.sfx.unlock();
    this.message.setText('');
    if (key === 'Backspace') this.backspace();
    else if (key === 'Escape') this.goBack();
    else if (key === 'Enter' || key === 'Tab') this.confirm();
    else if (this.step === 'nation') {
      const dir = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
      this.countryIndex = (this.countryIndex + dir + COUNTRIES.length) % COUNTRIES.length;
      this.sfx.step();
    }
    this.refresh();
  }

  private backspace(): void {
    if (this.step === 'name') this.nameText = this.nameText.slice(0, -1);
    else if (this.step === 'pin' && this.pinText.length > 0) this.pinText = this.pinText.slice(0, -1);
    else this.goBack();
  }

  private goBack(): void {
    if (this.step === 'pin') {
      this.pinText = '';
      this.step = this.existing ? 'name' : 'nation';
      if (this.step === 'name') this.existing = null;
    } else if (this.step === 'nation') {
      this.step = 'name';
    } else if (this.save.activeProfileId) {
      this.scene.start('title');
    }
  }

  private confirm(): void {
    if (this.step === 'name') {
      const name = normalizeName(this.nameText);
      if (!name) {
        this.fail('TYPE A NAME FIRST');
        return;
      }
      if (!nameAllowed(name)) {
        this.fail('PICK ANOTHER NAME');
        return;
      }
      this.nameText = name;
      if (name === 'GUEST') {
        this.signIn(ensureGuest(this.save, new Date().toISOString()));
        return;
      }
      this.existing = findProfile(this.save, name);
      this.pinText = '';
      this.pinTries = 0;
      this.step = this.existing ? 'pin' : 'nation';
      this.sfx.marks();
    } else if (this.step === 'nation') {
      this.step = 'pin';
      this.sfx.marks();
    } else {
      if (this.pinText.length !== PIN_LENGTH) {
        this.fail(`THE PIN IS ${PIN_LENGTH} DIGITS`);
        return;
      }
      if (this.existing) {
        if (checkPin(this.existing, this.pinText)) {
          this.signIn(this.existing);
        } else {
          this.pinTries += 1;
          this.pinText = '';
          if (this.pinTries >= MAX_PIN_TRIES) {
            this.existing = null;
            this.step = 'name';
            this.fail('WRONG PIN. START AGAIN');
          } else {
            this.fail(`WRONG PIN. ${MAX_PIN_TRIES - this.pinTries} TRIES LEFT`);
          }
        }
      } else {
        try {
          const profile = createProfile(
            this.save,
            { name: this.nameText, nationality: (COUNTRIES[this.countryIndex] as readonly [string, string])[0], pin: this.pinText },
            new Date().toISOString(),
            randomSalt(),
          );
          this.signIn(profile);
        } catch (e) {
          this.fail(e instanceof Error ? e.message.toUpperCase() : 'COULD NOT CREATE ATHLETE');
        }
      }
    }
  }

  private fail(text: string): void {
    this.message.setText(text);
    this.sfx.error();
    this.cameras.main.shake(120, 0.004);
  }

  private signIn(profile: Profile): void {
    this.save.activeProfileId = profile.id;
    persistSave(this.store, this.save);
    this.sfx.finish();
    this.scene.start('title');
  }

  // ------------------------------------------------------------ drawing

  private refresh(): void {
    if (!this.rows) return;
    const blink = '_';
    const country = COUNTRIES[this.countryIndex] as readonly [string, string];

    this.rows.name.value.setText(this.nameText + (this.step === 'name' && this.nameText.length < NAME_MAX ? blink : ''));

    const shownCode = this.existing ? this.existing.nationality : this.step === 'name' ? null : country[0];
    this.nationFlag.setVisible(shownCode !== null);
    if (shownCode) this.nationFlag.setTexture(flagKey(shownCode));
    if (this.existing) {
      this.rows.nation.value.setText(`${this.existing.nationality}  ${countryName(this.existing.nationality)}`);
    } else if (this.step === 'name') {
      this.rows.nation.value.setText('');
    } else {
      this.rows.nation.value.setText(this.step === 'nation' ? `◀ ${country[0]}  ${country[1]} ▶` : `${country[0]}  ${country[1]}`);
    }

    // The PIN is masked; only its length shows.
    const dots = '● '.repeat(this.pinText.length) + '○ '.repeat(PIN_LENGTH - this.pinText.length);
    this.rows.pin.value.setText(this.step === 'pin' ? dots.trim() : '');

    for (const step of ['name', 'nation', 'pin'] as const) {
      const row = this.rows[step];
      const active = step === this.step;
      row.box.setStrokeStyle(3, active ? 0xffd23f : 0x5b3aa6).setFillStyle(active ? 0x3b1d6e : 0x2a1458);
      row.label.setColor(active ? COLORS.gold : COLORS.dim);
    }

    if (this.step === 'name') {
      this.heading.setText('ENTER YOUR NAME');
      this.hint.setText(`${mobile.needsKeyboardTap() ? 'TAP HERE TO TYPE     ' : ''}${this.save.activeProfileId ? 'ENTER: next     ESC: back to title' : 'ENTER: next'}`);
    } else if (this.step === 'nation') {
      this.heading.setText('NEW ATHLETE: PICK YOUR NATIONALITY');
      this.hint.setText('ARROWS or type to search     ENTER: next     ESC: back');
    } else if (this.existing) {
      this.heading.setText(`WELCOME BACK ${this.existing.name}: ENTER YOUR PIN`);
      this.hint.setText('ENTER: sign in     ESC: back');
    } else {
      this.heading.setText(`NEW ATHLETE: CHOOSE A ${PIN_LENGTH}-DIGIT PIN`);
      this.hint.setText('ENTER: create athlete     ESC: back');
    }
  }
}
