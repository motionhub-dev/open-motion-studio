// Drives the built Studio for a look at it: launches Electron with a throwaway profile (so the person's recent
// projects and settings are untouched), opens an example from the launcher, runs the steps given and exits.
//
//   node drive.mjs <shots-dir> [example] [step ...]
//
// example: kinetic (default), product or data. Steps run in order:
//   ss:<name>        screenshot to <shots-dir>/<name>.png
//   key:<key>        press a key (Playwright names: Space, ArrowRight, Backslash, BracketLeft, ...)
//   click:<css>      click the first element matching the selector, through the DOM
//   wait:<ms>        wait
//   size:<w>x<h>     resize the window
//   boxes            print the workspace's panels' boxes as JSON
// With no steps it takes ss:workspace and prints boxes.
//
// playwright-core is not a dependency of the repository: OMS_PLAYWRIGHT names a folder where it is installed.
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const pwDir = process.env.OMS_PLAYWRIGHT;
if (!pwDir) throw new Error('Set OMS_PLAYWRIGHT to a folder with playwright-core installed (npm i playwright-core).');
const { _electron: electron } = createRequire(path.join(path.resolve(pwDir), 'package.json'))('playwright-core');

const [, , outArg, example = 'kinetic', ...given] = process.argv;
if (!outArg) throw new Error('usage: node drive.mjs <shots-dir> [example] [step ...]');
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const steps = given.length ? given : ['ss:workspace', 'boxes'];

const appDir = path.resolve(import.meta.dirname, '../../../apps/desktop');
if (!fs.existsSync(path.join(appDir, 'out', 'main'))) throw new Error('No build: run `pnpm build` at the repository root first.');
const dist = path.join(appDir, 'node_modules', 'electron', 'dist');
const bin =
  process.platform === 'win32'
    ? path.join(dist, 'electron.exe')
    : process.platform === 'darwin'
      ? path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron')
      : path.join(dist, 'electron');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-profile-'));
const args = [appDir, `--user-data-dir=${profile}`];
if (process.platform === 'linux') args.push('--no-sandbox');
const app = await electron.launch({ executablePath: bin, args, timeout: 60_000 });
try {
  const page = await app.firstWindow();
  const resize = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]?.setSize(w, h), [w, h]);
  await resize(1600, 960);
  await page.waitForSelector('.example-card', { timeout: 30_000 });
  const card = await page.$(`.example-card.example-${example}`);
  if (!card) throw new Error(`No example "${example}" in the launcher.`);
  await card.evaluate((el) => el.click());
  await page.waitForSelector('.stage-bar', { timeout: 30_000 });
  // The film builds and its frame loads after the workspace shows.
  await page.waitForSelector('.stage .plate', { timeout: 30_000 }).catch(() => console.log('note: no frame drawn (does the film build?)'));
  await page.waitForTimeout(1500);

  for (const step of steps) {
    const at = step.indexOf(':');
    const [verb, arg] = at < 0 ? [step, ''] : [step.slice(0, at), step.slice(at + 1)];
    if (verb === 'ss') {
      const file = path.join(out, `${arg || `shot-${Date.now()}`}.png`);
      await page.screenshot({ path: file });
      console.log('screenshot:', file);
    } else if (verb === 'key') await page.keyboard.press(arg);
    else if (verb === 'click') {
      const found = await page.evaluate((s) => {
        const el = document.querySelector(s);
        el?.click();
        return !!el;
      }, arg);
      if (!found) console.log('not found:', arg);
    } else if (verb === 'wait') await page.waitForTimeout(Number(arg) || 500);
    else if (verb === 'size') {
      const [w, h] = arg.split('x').map(Number);
      await resize(w, h);
      await page.waitForTimeout(500);
    } else if (verb === 'boxes') {
      console.log(
        JSON.stringify(
          await page.evaluate(() => {
            const box = (s) => {
              const r = document.querySelector(s)?.getBoundingClientRect();
              return r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            };
            return Object.fromEntries(
              ['.assistant', '.stage', '.picture', '.stage-bar', '.plate', '.side', '.timeline-sheet'].map((s) => [s, box(s)]),
            );
          }),
        ),
      );
    } else console.log('unknown step:', step);
    await page.waitForTimeout(300);
  }
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
