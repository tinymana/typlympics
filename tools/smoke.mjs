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
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__typlympics?.scene?.isActive('title'));
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
  await page.keyboard.press('Enter');
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
  check('save has version 1 and the best time with its log', stored.saveVersion === 1 && stored.records['100m@1'].timeMs === best && stored.records['100m@1'].log.length >= 100);
  check('save counts races', stored.totals.races === 3 && stored.totals.finishes === 3, JSON.stringify(stored.totals));
  await page.reload();
  await page.waitForFunction(() => window.__typlympics?.scene?.isActive('title'));
  await sleep(300);
  await page.screenshot({ path: join(outDir, '7-title-with-pb.png') });

  // Frame rate while racing.
  await page.keyboard.press('Enter');
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
