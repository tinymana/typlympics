/**
 * Assembles the public website into _site/:
 *   site/*            -> _site/        (landing page, dev notes, art)
 *   apps/client/dist  -> _site/play/   (the game build)
 *
 * Run `pnpm build` first, or use `pnpm site`, which does both.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
const game = join(root, 'apps', 'client', 'dist');

if (!existsSync(join(game, 'index.html'))) {
  console.error('Game build not found. Run `pnpm build` first.');
  process.exit(1);
}

// Fail early on a broken dev-notes file instead of publishing it.
const notes = JSON.parse(readFileSync(join(root, 'site', 'devnotes.json'), 'utf8'));
if (!Array.isArray(notes.notes) || notes.notes.length === 0) {
  console.error('site/devnotes.json has no notes.');
  process.exit(1);
}
for (const n of notes.notes) {
  if (!n.version || !n.date || !n.title || !Array.isArray(n.items)) {
    console.error(`Dev note is missing a field: ${JSON.stringify(n).slice(0, 120)}`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'site'), out, { recursive: true });
cpSync(game, join(out, 'play'), { recursive: true });
// Tell GitHub Pages to serve the files as they are, without Jekyll.
writeFileSync(join(out, '.nojekyll'), '');

console.log(`Site assembled in _site/ (latest dev note: v${notes.notes[0].version} ${notes.notes[0].title})`);
