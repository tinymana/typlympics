/**
 * Browser smoke test: plays real races in headless Chrome with real key
 * events and checks the results against the rules.
 *
 *   pnpm build && node tools/smoke.mjs [screenshot-dir]
 *
 * Set CHROME_PATH to a Chrome or Chromium binary if it is not on the
 * default path.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createMockServer } from './mock-online.mjs';

const outDir = process.argv[2] ?? 'smoke-out';
mkdirSync(outDir, { recursive: true });
const PORT = 4179;

const server = spawn('pnpm', ['--filter', '@typlympics/client', 'exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

let browser;
try {
  await sleep(1500);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  // The online API is answered by an in-memory stand-in, so the Compete
  // screens can be driven without a network.
  const mock = createMockServer();
  const withMock = async (p) => {
    await p.route('**/functions/v1/typlympics', async (route) => {
      const answer = mock.handle(route.request().postDataJSON());
      await route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.json) });
    });
    return p;
  };
  const page = await withMock(await browser.newPage({ viewport: { width: 960, height: 540 } }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // Expected refusals (a wrong PIN) show up as 4xx resource errors.
    if (m.type() === 'error' && !/status of 40[0-9]/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`http://localhost:${PORT}/`);

  // Sign-in: a new athlete with a test PIN, then sign out and back in.
  const scene = (key) => page.waitForFunction((k) => window.__typlympics?.scene?.isActive(k), key, { timeout: 8000 });
  const typeText = async (text) => {
    for (const ch of text) await page.keyboard.press(ch === ' ' ? 'Space' : ch);
  };
  /** On the opponent screen, moves to the top row (time trial) and starts. */
  const pickTimeTrial = async () => {
    for (let i = 0; i < 9; i++) {
      const sel = await page.evaluate(() => window.__typlympics.scene.getScene('rivals').selected);
      if (sel === 0) break;
      await page.keyboard.press('ArrowUp');
    }
    await page.keyboard.press('Enter');
  };
  /** On the distance screen, moves to the given row. */
  const pickEvent = async (index) => {
    for (let i = 0; i < 6; i++) {
      const sel = await page.evaluate(() => window.__typlympics.scene.getScene('events').selected);
      if (sel === index) return;
      await page.keyboard.press(sel < index ? 'ArrowDown' : 'ArrowUp');
    }
  };
  const TEST_PIN = '4821';
  await scene('login');
  await sleep(300);
  await typeText('smoke test');
  await page.keyboard.press('Enter');
  await typeText('jam');
  await sleep(150);
  await page.screenshot({ path: join(outDir, '0-sign-in.png') });
  await page.keyboard.press('Enter');
  await typeText(TEST_PIN);
  await page.keyboard.press('Enter');
  await scene('title');
  const afterCreate = await page.evaluate(() => JSON.parse(localStorage.getItem('typlympics.save')));
  check('sign-in creates an athlete with name and nationality', afterCreate.activeProfileId === 'smoke-test' && afterCreate.profiles['smoke-test'].nationality === 'JAM');
  check('the PIN is not stored in the save', !JSON.stringify(afterCreate).includes(TEST_PIN));

  await page.keyboard.press('Escape');
  await scene('login');
  await typeText('smoke test');
  await page.keyboard.press('Enter');
  await typeText('0000');
  await page.keyboard.press('Enter');
  await sleep(200);
  check('a wrong PIN does not sign in', await page.evaluate(() => window.__typlympics.scene.isActive('login')));
  await page.screenshot({ path: join(outDir, '0-wrong-pin.png') });
  await typeText(TEST_PIN);
  await page.keyboard.press('Enter');
  await scene('title');
  check('the right PIN signs back in', true);
  await sleep(400);
  await page.screenshot({ path: join(outDir, '1-title.png') });

  const race = () => page.evaluate(() => {
    const s = window.__typlympics.scene.getScene('race');
    return { phase: s.phase, text: s.line?.text, pos: s.sim?.pos, result: s.result, pb: s.pbTimeMs, panel: s.panel?.visible };
  });
  const waitPhase = (phase) =>
    page.waitForFunction((p) => window.__typlympics.scene.getScene('race').phase === p, phase, { timeout: 8000 });

  /** Types the whole line with a fixed gap between keys; optional wrong key first. */
  async function runRace({ gapMs, reactionMs = 160, wrongAt = -1 }) {
    await waitPhase('marks');
    const { text } = await race();
    await waitPhase('race');
    await sleep(reactionMs);
    for (let i = 0; i < text.length; i++) {
      if (i === wrongAt) {
        await page.keyboard.press('#');
        await sleep(230); // sit out the 200 ms lockout
      }
      await page.keyboard.press(text[i] === ' ' ? 'Space' : text[i]);
      if (i === 45) await page.screenshot({ path: join(outDir, `race-mid-${gapMs}.png`) });
      await sleep(gapMs);
    }
    await waitPhase('result');
    await sleep(700);
    return (await race()).result;
  }

  // Race 1: clean, moderate pace.
  const startRematch = Date.now();
  // Title menu: Train is selected by default; then pick the 100m.
  await page.keyboard.press('Enter');
  await scene('events');
  await sleep(250);
  await page.screenshot({ path: join(outDir, '1b-train.png') });
  await page.keyboard.press('Enter');
  await scene('rivals');
  await sleep(250);
  await page.screenshot({ path: join(outDir, '1c-rivals.png') });
  await pickTimeTrial();
  await waitPhase('marks');
  await sleep(300);
  await page.screenshot({ path: join(outDir, '2-marks.png') });
  const r1 = await runRace({ gapMs: 60 });
  await page.screenshot({ path: join(outDir, '3-result-first.png') });
  check('race 1 finishes with 100 m and no errors', r1.finished && r1.distance === 100 && r1.errors === 0, `time ${r1.timeMs} ms`);
  check('race 1 reaction is legal', r1.reactionMs >= 100 && !r1.falseStart, `reaction ${r1.reactionMs} ms`);
  check('race 1 time is consistent with typing pace', r1.timeMs > 99 * 60 && r1.timeMs < 99 * 60 + 4000, `${r1.timeMs} ms`);
  const afterFirst = await race();
  check('result panel is shown', afterFirst.panel === true);

  // Rematch speed: Enter to "On your marks".
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  await waitPhase('marks');
  check('rematch reaches marks in under 1 s', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  check('personal best is loaded for the ghost', (await race()).pb === r1.timeMs, `pb ${(await race()).pb}`);

  // Race 2: one wrong key, slower. Must count the error and not beat race 1.
  const r2 = await runRace({ gapMs: 75, wrongAt: 20 });
  await page.screenshot({ path: join(outDir, '4-result-slower.png') });
  check('race 2 counts exactly one error', r2.errors === 1, `errors ${r2.errors}`);
  check('race 2 is slower and keeps the old record', r2.timeMs > r1.timeMs && (await race()).pb === r1.timeMs);

  // Race 3: false start, then a faster clean run for a new record.
  await page.keyboard.press('Tab');
  await waitPhase('marks');
  await sleep(200);
  await page.keyboard.press('a'); // before the gun
  await sleep(150);
  await page.screenshot({ path: join(outDir, '5-false-start.png') });
  const r3 = await runRace({ gapMs: 40, reactionMs: 330 });
  await page.screenshot({ path: join(outDir, '6-result-record.png') });
  check('race 3 records the false start', r3.falseStart === true);
  check('race 3 still finishes after the penalty', r3.finished && r3.timeMs > 300, `${r3.timeMs} ms`);

  // Persistence across a reload.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('typlympics.save')));
  const best = Math.min(r1.timeMs, r3.timeMs);
  const me = stored.profiles['smoke-test'];
  check('save has version 5 and the athlete\'s best time with its log', stored.saveVersion === 5 && me.records['100m@1'].timeMs === best && me.records['100m@1'].log.length >= 100);
  check('save counts races', me.totals.races === 3 && me.totals.finishes === 3, JSON.stringify(me.totals));
  check('race history has one entry per finished race', me.history.length === 3, `${me.history.length}`);
  await page.reload();
  await page.waitForFunction(() => window.__typlympics?.scene?.isActive('title'));
  await sleep(300);
  await page.screenshot({ path: join(outDir, '7-title-with-pb.png') });

  // Menu: Career, Compete and World Records open and return to the title.
  // The title remembers the last row chosen, so each step moves relative to it.
  // Rows: 0 Train, 1 Compete, 2 Career, 3 World Records. Start on 0.
  let row = 0;
  for (const [target, key] of [[2, 'career'], [1, 'compete'], [3, 'records']]) {
    while (row !== target) {
      await page.keyboard.press('ArrowDown');
      row = (row + 1) % 4;
    }
    await sleep(150);
    if (key === 'compete') await page.screenshot({ path: join(outDir, '7b-menu-compete-selected.png') });
    await page.keyboard.press('Enter');
    await scene(key);
    await sleep(250);
    await page.screenshot({ path: join(outDir, `9-${key}.png`) });
    await page.keyboard.press('Escape');
    await scene('title');
    await sleep(100);
  }
  check('career, compete and world records screens open from the menu', true);
  while (row !== 0) {
    await page.keyboard.press('ArrowDown');
    row = (row + 1) % 4;
  }

  // A longer distance: the 200m, with its scrolling text band.
  await page.keyboard.press('Enter');
  await scene('events');
  await sleep(200);
  await page.screenshot({ path: join(outDir, '12-distances.png') });
  await pickEvent(1);
  await page.keyboard.press('Enter');
  await scene('rivals');
  await pickTimeTrial();
  const r200 = await runRace({ gapMs: 25 });
  await page.screenshot({ path: join(outDir, '13-200m-result.png') });
  const after200 = await page.evaluate(() => JSON.parse(localStorage.getItem('typlympics.save')).profiles['smoke-test']);
  check('the 200m runs 200 metres under its own ruleset', r200.finished && r200.distance === 200 && r200.rulesetId === '200m@1', `${r200.timeMs} ms`);
  check('the 200m keeps its own record and history, apart from the 100m', after200.records['200m@1']?.timeMs === r200.timeMs && after200.records['100m@1'].timeMs === best && after200.history.some((h) => h.rulesetId === '200m@1'));
  check('200m splits are reported at 50, 100, 150 and 200 metres', r200.splits.map((x) => x.mark).join() === '50,100,150,200');
  await page.keyboard.press('Escape');
  await scene('rivals');
  await page.keyboard.press('Escape');
  await scene('events');
  await page.keyboard.press('Escape');
  await scene('title');

  // Rivals: race the slowest rival, win, and see the win recorded.
  await page.keyboard.press('Enter');
  await scene('events');
  await pickEvent(0);
  await page.keyboard.press('Enter');
  await scene('rivals');
  const startRow = await page.evaluate(() => {
    const s = window.__typlympics.scene.getScene('rivals');
    return s.rows[s.selected].rivalId;
  });
  check('the opponent screen starts on the next rival to beat', startRow === 'turtle', startRow);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(200);
  check('a locked rival cannot be raced', await page.evaluate(() => window.__typlympics.scene.isActive('rivals')));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const rr = await runRace({ gapMs: 45 });
  await page.screenshot({ path: join(outDir, '10-rival-result.png') });
  const afterRival = await page.evaluate(() => JSON.parse(localStorage.getItem('typlympics.save')).profiles['smoke-test']);
  check('beating a rival is recorded for the athlete', rr.finished && afterRival.rivalsBeaten['100m@1']?.includes('turtle'), JSON.stringify(afterRival.rivalsBeaten));
  await page.keyboard.press('Escape');
  await scene('rivals');
  await sleep(200);
  await page.screenshot({ path: join(outDir, '11-rivals-after-win.png') });

  // Frame rate while racing.
  await pickTimeTrial();
  await waitPhase('race');
  const fps = await page.evaluate(() => window.__typlympics.loop.actualFps);
  check('frame rate is near 60', fps > 50, `${fps.toFixed(1)} fps`);

  // Measurement: held-key repeats and paste never count, and logged times
  // match the browser's event timestamps to the millisecond.
  const m = await page.evaluate(async () => {
    const s = window.__typlympics.scene.getScene('race');
    const text = s.line.text;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(160);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: text[0], repeat: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: text[0], isComposing: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: text[0], ctrlKey: true, cancelable: true }));
    const paste = new Event('paste', { cancelable: true });
    window.dispatchEvent(paste);
    const posAfterIgnored = s.sim.pos;
    const samples = [];
    for (let i = 0; i < 20; i++) {
      await wait(31 + (i % 5) * 7);
      const ev = new KeyboardEvent('keydown', { key: text[i], cancelable: true });
      const expected = Math.round(ev.timeStamp - s.gunAt);
      window.dispatchEvent(ev);
      samples.push(Math.abs(s.log[s.log.length - 1].t - expected));
    }
    return { posAfterIgnored, pastePrevented: paste.defaultPrevented, worst: Math.max(...samples), pos: s.sim.pos };
  });
  check('repeat, composition, chord and paste input do not advance the athlete', m.posAfterIgnored === 0 && m.pastePrevented);
  check('logged key times are within 1 ms of the event timestamps', m.worst <= 1 && m.pos === 20, `worst ${m.worst} ms`);
  await sleep(250);
  await page.screenshot({ path: join(outDir, '8-drive-phase.png') });

  // ---------------------------------------------------------- online: two athletes
  const sceneOn = (p, key) => p.waitForFunction((k) => window.__typlympics?.scene?.isActive(k), key, { timeout: 8000 });
  const typeOn = async (p, text) => {
    for (const ch of text) await p.keyboard.press(ch === ' ' ? 'Space' : ch);
  };
  /** A fresh browser profile: sign up locally, then go online with the same PIN. */
  const newAthlete = async (name, pin) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const p = await withMock(await ctx.newPage());
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => {
      if (m.type() === 'error' && !/status of 40[0-9]/.test(m.text())) errors.push(m.text());
    });
    await p.goto(`http://localhost:${PORT}/`);
    await sceneOn(p, 'login');
    await sleep(200);
    await typeOn(p, name);
    await p.keyboard.press('Enter');
    await p.keyboard.press('Enter');
    await typeOn(p, pin);
    await p.keyboard.press('Enter');
    await sceneOn(p, 'title');
    await p.keyboard.press('ArrowDown'); // Compete
    await p.keyboard.press('Enter');
    await sceneOn(p, 'compete');
    await sleep(150);
    await typeOn(p, pin);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__typlympics.scene.getScene('compete').step === 'menu', null, { timeout: 8000 });
    return p;
  };
  const hostPage = await newAthlete('host one', '1111');
  const guestPage = await newAthlete('guest two', '2222');
  await hostPage.screenshot({ path: join(outDir, '20-compete-menu.png') });

  await hostPage.keyboard.press('Enter'); // Host a race
  await hostPage.keyboard.press('Enter'); // 100 M
  await sceneOn(hostPage, 'lobby');
  const roomPin = await hostPage.evaluate(() => window.__typlympics.scene.getScene('lobby').pin);
  check('hosting opens a room with a five-digit PIN', /^[0-9]{5}$/.test(roomPin), roomPin);

  await guestPage.keyboard.press('ArrowDown'); // Join a race
  await guestPage.keyboard.press('Enter');
  await typeOn(guestPage, '00000');
  await guestPage.keyboard.press('Enter');
  await sleep(300);
  check('a wrong room PIN is refused', await guestPage.evaluate(() => window.__typlympics.scene.isActive('compete')));
  await typeOn(guestPage, roomPin);
  await guestPage.keyboard.press('Enter');
  await sceneOn(guestPage, 'lobby');
  await hostPage.waitForFunction(() => window.__typlympics.scene.getScene('lobby').room?.members.length === 2, null, { timeout: 8000 });
  await sleep(200);
  await hostPage.screenshot({ path: join(outDir, '21-lobby-host.png') });
  check('the host sees both athletes in the room', true);

  await guestPage.keyboard.press('Enter'); // not the host: must do nothing
  await sleep(300);
  check('only the host can start', await guestPage.evaluate(() => window.__typlympics.scene.isActive('lobby')));
  await hostPage.keyboard.press('Enter');
  const racePhase = (p, phase) => p.waitForFunction((ph) => window.__typlympics.scene.isActive('race') && window.__typlympics.scene.getScene('race').phase === ph, phase, { timeout: 15000 });
  await Promise.all([racePhase(hostPage, 'race'), racePhase(guestPage, 'race')]);
  const [textA, textB] = await Promise.all([hostPage, guestPage].map((p) => p.evaluate(() => window.__typlympics.scene.getScene('race').line.text)));
  check('both athletes get the same line from the server seed', textA === textB && textA.length === 100);
  const typeRace = async (p, gap) => {
    await sleep(170);
    for (let i = 0; i < textA.length; i++) {
      await p.keyboard.press(textA[i] === ' ' ? 'Space' : textA[i]);
      if (p === hostPage && i === 60) await p.screenshot({ path: join(outDir, '22-online-race.png') });
      await sleep(gap);
    }
  };
  await Promise.all([typeRace(hostPage, 35), typeRace(guestPage, 60)]);
  const standingsDone = (p) => p.waitForFunction(() => window.__typlympics.scene.getScene('race').standingsDone === true, null, { timeout: 15000 });
  await Promise.all([standingsDone(hostPage), standingsDone(guestPage)]);
  await sleep(500);
  await hostPage.screenshot({ path: join(outDir, '23-online-result-host.png') });
  await guestPage.screenshot({ path: join(outDir, '24-online-result-guest.png') });
  const headline = (p) => p.evaluate(() => window.__typlympics.scene.getScene('race').panelText.headline.text);
  const [headA, headB] = await Promise.all([headline(hostPage), headline(guestPage)]);
  check('the faster athlete is placed first and the slower second', headA.startsWith('1ST PLACE') && headB.startsWith('2ND PLACE'), `${headA} / ${headB}`);
  const serverRace = [...mock.state.races.values()][0];
  const serverTimes = [...serverRace.entries.values()].map((e) => e.timeMs);
  const localOfficial = await hostPage.evaluate(() => window.__typlympics.scene.getScene('race').official.timeMs);
  check('times come from the server, computed from the keystroke logs', serverTimes.every((t) => t > 0) && serverTimes.includes(localOfficial), serverTimes.join(', '));
  check('the guest saw the host move during the race', await guestPage.evaluate(() => window.__typlympics.scene.getScene('race').opponents[0].pos === 100));

  await hostPage.keyboard.press('Enter');
  await sceneOn(hostPage, 'lobby');
  await sleep(1300);
  check('after the race the host is back in the room, not thrown into the old race', await hostPage.evaluate(() => window.__typlympics.scene.isActive('lobby')));

  // Invites: the host copies a link, and opening it lands a signed-in athlete in the room.
  await hostPage.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
  });
  await hostPage.keyboard.press('i');
  await sleep(200);
  const copied = await hostPage.evaluate(() => window.__copied);
  check('pressing I in the room copies an invite with the room link', typeof copied === 'string' && copied.includes(`?room=${roomPin}`) && copied.includes(roomPin), copied);
  await guestPage.goto(`http://localhost:${PORT}/?room=${roomPin}`);
  await sceneOn(guestPage, 'lobby');
  const invited = await guestPage.evaluate(() => ({ pin: window.__typlympics.scene.getScene('lobby').pin, address: window.location.search }));
  check('opening an invite link joins the room and tidies the address', invited.pin === roomPin && invited.address === '', JSON.stringify(invited));
  await hostPage.keyboard.press('Escape');
  await sceneOn(hostPage, 'compete');
  await hostPage.keyboard.press('Escape');
  await sceneOn(hostPage, 'title');
  await hostPage.keyboard.press('ArrowDown');
  await hostPage.keyboard.press('ArrowDown');
  await hostPage.keyboard.press('Enter');
  // Stand in for last week having closed with the host taking gold.
  mock.state.medals.push({ weekStart: '2026-11-16', rulesetId: '100m@1', device: 'keyboard', rank: 1, name: 'HOST ONE', nationality: 'USA', timeMs: 9500 });
  await sceneOn(hostPage, 'records');
  await hostPage.waitForFunction(() => window.__typlympics.scene.getScene('records').week !== null, null, { timeout: 8000 });
  await sleep(200);
  await hostPage.screenshot({ path: join(outDir, '25-this-week.png') });
  const weekBoard = await hostPage.evaluate(() => {
    const w = window.__typlympics.scene.getScene('records').week;
    return { rows: w.boards['100m@1'], last: w.lastWeek?.medals.length };
  });
  check("This Week lists both athletes, fastest first, with last week's medallist", weekBoard.rows.length === 2 && weekBoard.rows[0].name === 'HOST ONE' && weekBoard.last === 1);
  await hostPage.keyboard.press('Enter'); // all time
  await hostPage.waitForFunction(() => window.__typlympics.scene.getScene('records').allTime !== null, null, { timeout: 8000 });
  await sleep(200);
  await hostPage.screenshot({ path: join(outDir, '26-all-time.png') });
  const board = await hostPage.evaluate(() => window.__typlympics.scene.getScene('records').allTime.boards['100m@1']);
  check('All Time lists both athletes, fastest first', board.length === 2 && board[0].name === 'HOST ONE' && board[0].timeMs < board[1].timeMs);
  await hostPage.keyboard.press('Enter'); // hall of fame
  await hostPage.waitForFunction(() => window.__typlympics.scene.getScene('records').hallData !== null, null, { timeout: 8000 });
  await sleep(200);
  await hostPage.screenshot({ path: join(outDir, '27-hall-of-fame.png') });
  const hall = await hostPage.evaluate(() => window.__typlympics.scene.getScene('records').hallData);
  check('the Hall of Fame shows the stored medal and the medal table', hall.month === '2026-11' && hall.medals.length === 1 && hall.medalTable[0].gold === 1);
  await hostPage.keyboard.press('ArrowUp'); // phone boards
  await sleep(150);
  check('keyboard and phone boards switch', await hostPage.evaluate(() => window.__typlympics.scene.getScene('records').phone === true));
  await hostPage.keyboard.press('Escape');
  await sceneOn(hostPage, 'title');
  await hostPage.keyboard.press('ArrowUp'); // World Records -> Career
  await hostPage.keyboard.press('Enter');
  await sceneOn(hostPage, 'career');
  await sleep(600);
  await hostPage.screenshot({ path: join(outDir, '28-career-medals.png') });
  const careerTexts = await hostPage.evaluate(() => window.__typlympics.scene.getScene('career').children.list.filter((o) => o.type === 'Text').map((o) => o.text));
  check('the career page shows the athlete\'s weekly medals', careerTexts.some((t) => t.includes('GOLD 1   SILVER 0   BRONZE 0')) && careerTexts.some((t) => t.startsWith('Latest: GOLD 100M')), careerTexts.filter((t) => /GOLD|Latest/.test(t)).join(' | '));

  // ---------------------------------------------------------- phone: on-screen keyboard
  // A headless browser has no touch screen or phone keyboard, so the test
  // switches the game's touch mode on and types into the hidden text field.
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await phoneCtx.addInitScript(() => {
    window.__typlympicsTouch = true;
    window.__typlympicsSoftKeyboard = true;
  });
  const phone = await withMock(await phoneCtx.newPage());
  phone.on('pageerror', (e) => errors.push(String(e)));
  phone.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[0-9]/.test(m.text())) errors.push(m.text());
  });
  await phone.goto(`http://localhost:${PORT}/`);
  await sceneOn(phone, 'login');
  await sleep(300);
  check('touch devices get the menu buttons', await phone.locator('#touch-bar').isVisible());
  // Tapping the sign-in form itself opens the keyboard, as on an iPad.
  await phone.locator('canvas').tap({ position: { x: 120, y: 60 } });
  check('tapping the sign-in form opens the keyboard field', await phone.evaluate(() => document.activeElement?.id === 'soft-input'));
  await phone.evaluate(() => document.activeElement?.blur());
  const softFocused = () => phone.evaluate(() => document.activeElement?.id === 'soft-input');
  const tapKey = (label) => phone.locator('#touch-bar .touch-key', { hasText: label }).first().tap();
  await tapKey('TYPE');
  check('the TYPE button opens the keyboard field', await softFocused());
  await phone.keyboard.type('Thumbs', { delay: 20 }); // a phone would capitalise the first letter
  await sleep(100);
  check('text typed on the phone keyboard reaches the game', await phone.evaluate(() => window.__typlympics.scene.getScene('login').nameText === 'THUMBS'));
  await phone.keyboard.press('Enter');
  await phone.keyboard.press('Enter');
  await phone.keyboard.type('3333', { delay: 20 });
  await phone.keyboard.press('Enter');
  await sceneOn(phone, 'title');
  await sleep(200);

  // Keyboard dismissed: menus are driven with the on-screen buttons.
  await phone.evaluate(() => document.activeElement?.blur());
  await sleep(150);
  await phone.screenshot({ path: join(outDir, '30-phone-title.png') });
  await tapKey('ENTER'); // Train
  await sceneOn(phone, 'events');
  await tapKey('ENTER'); // 100 M
  await sceneOn(phone, 'rivals');
  await tapKey('\u25B2'); // up from the first rival to the time trial
  await sleep(100);
  await tapKey('ENTER');
  await sceneOn(phone, 'race');
  await sleep(700);
  const waiting = await phone.evaluate(() => {
    const r = window.__typlympics.scene.getScene('race');
    return { phase: r.phase, banner: r.banner.text };
  });
  check('a phone race waits on its marks until the keyboard is open', waiting.phase === 'marks' && waiting.banner === 'TAP TO START', JSON.stringify(waiting));
  await phone.screenshot({ path: join(outDir, '31-phone-waiting.png') });
  await phone.locator('#race-text').tap(); // tapping the text opens the keyboard too
  check('tapping the race text opens the keyboard', await softFocused());
  await racePhase(phone, 'race');
  const phoneText = await phone.evaluate(() => window.__typlympics.scene.getScene('race').line.text);
  await sleep(180);
  await phone.keyboard.type(phoneText.slice(0, 40), { delay: 30 });
  await phone.screenshot({ path: join(outDir, '32-phone-race.png') });
  check('the race text is shown large under the game', await phone.locator('#race-text').isVisible() && (await phone.locator('#race-text .next').count()) === 1);
  await phone.keyboard.type(phoneText.slice(40), { delay: 30 });
  await racePhase(phone, 'result');
  await sleep(600);
  await phone.screenshot({ path: join(outDir, '33-phone-result.png') });
  const phoneSave = await phone.evaluate(() => JSON.parse(localStorage.getItem('typlympics.save')).profiles.thumbs);
  check('a race typed on the phone keyboard finishes cleanly', phoneSave.history.length === 1 && phoneSave.history[0].errors === 0, JSON.stringify(phoneSave.history[0]));
  check('the race is recorded as typed on a phone', phoneSave.history[0].device === 'phone');
  const pcSave = await page.evaluate(() => JSON.parse(localStorage.getItem('typlympics.save')).profiles['smoke-test']);
  check('races typed on a physical keyboard are recorded as keyboard', pcSave.history.every((h) => h.device === 'keyboard'));
  const mockDevices = [...mock.state.bests.values()].map((b) => b.device);
  check('online results carry the device to the server', mockDevices.length === 2 && mockDevices.every((d) => d === 'keyboard'), mockDevices.join(','));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  void startRematch;
} catch (e) {
  console.error(e);
  failures.push('smoke test crashed');
} finally {
  await browser?.close();
  server.kill();
}
console.log(failures.length === 0 ? '\nAll smoke checks passed.' : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
