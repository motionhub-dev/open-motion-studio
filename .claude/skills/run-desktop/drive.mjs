// Drives the built Studio for a look at it: launches Electron with a throwaway profile (so the person's recent
// projects and settings are untouched), opens an example from the launcher, runs the steps given and exits.
//
//   node drive.mjs <shots-dir> [example] [step ...]
//
// example: kinetic (default), product or data. Steps run in order:
//   ss:<name>        screenshot to <shots-dir>/<name>.png
//   key:<key>        press a key (Playwright names: Space, ArrowRight, Backslash, BracketLeft, ...)
//   click:<css>      click the first element matching the selector, through the DOM
//   tap:<css>        click it with the mouse, as a person would: what needs a gesture (full screen) needs this
//   hover:<css>      move the mouse over it (and leave it there for the next steps)
//   wait:<ms>        wait
//   eval:<js>        evaluate an expression in the window and print its value as JSON
//   theme:<scheme>   dark, light or system: the colour scheme the window draws in
//   size:<w>x<h>     resize the window
//   boxes            print the workspace's panels' boxes as JSON
//   session:<file>   put a conversation (the built-in agent's messages, as .motion-studio/session.json holds them) in
//                    the open project, then close it and open it again from the launcher's recents, so it shows
//   stills:<n>       the same with a made-up conversation: one turn that looked at <n> stills of the film
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

/** A conversation of one turn that looked at `n` stills: the picture on the stage, cut from a screenshot of the window. */
async function lookedAt(page, n) {
  const box = await page.$eval('.stage .plate', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const data = (await page.screenshot({ clip: box, type: 'jpeg', quality: 70 })).toString('base64');
  const uses = Array.from({ length: n }, (_, i) => ({ type: 'tool_use', id: `still-${i}`, name: 'still', input: { time: i } }));
  const results = uses.map((use) => ({
    type: 'tool_result',
    tool_use_id: use.id,
    content: [
      { type: 'text', text: `The frame at ${use.input.time} s.` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
    ],
  }));
  return [
    { role: 'user', content: 'Check each second of the film.' },
    { role: 'assistant', content: uses },
    { role: 'user', content: results },
    { role: 'assistant', content: 'Every second reads cleanly; nothing overlaps.' },
  ];
}

/**
 * Waits for an opened project to settle: its frame drawn, and its agent known. The assistant is drawn again once the
 * agent is known, which drops anything done in it before.
 */
async function settled(page) {
  await page.waitForSelector('.stage .plate', { timeout: 30_000 }).catch(() => console.log('note: no frame drawn (does the film build?)'));
  // Polled from here: the app's CSP refuses the eval page.waitForFunction runs on.
  const finding = () => page.evaluate(() => !!document.querySelector('.assistant')?.textContent?.includes('Finding the agent'));
  const until = Date.now() + 30_000;
  while ((await finding()) && Date.now() < until) await page.waitForTimeout(200);
  if (await finding()) console.log('note: the agent is still being looked for');
  await page.waitForTimeout(300);
}

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
  await settled(page);

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
    } else if (verb === 'tap') {
      // A real click, for what only a person's gesture may do (full screen); it lands where the element is drawn.
      await page.click(arg, { timeout: 10_000 });
      await page.mouse.move(0, 0);
    } else if (verb === 'hover') await page.hover(arg, { timeout: 10_000 });
    else if (verb === 'wait') await page.waitForTimeout(Number(arg) || 500);
    else if (verb === 'eval') console.log(JSON.stringify(await page.evaluate(arg)));
    else if (verb === 'theme') {
      // The stylesheet follows prefers-color-scheme. Playwright emulates light by default, over the system's choice,
      // so the scheme is set through its emulation (system: no emulation).
      await page.emulateMedia({ colorScheme: arg === 'dark' || arg === 'light' ? arg : null });
      await page.waitForTimeout(500);
    }
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
    } else if (verb === 'session' || verb === 'stills') {
      const messages = verb === 'session' ? JSON.parse(fs.readFileSync(arg, 'utf8')) : await lookedAt(page, Number(arg) || 6);
      const project = await page.getAttribute('.topbar .name', 'title');
      fs.mkdirSync(path.join(project, '.motion-studio'), { recursive: true });
      fs.writeFileSync(path.join(project, '.motion-studio', 'session.json'), JSON.stringify(messages));
      await page.evaluate(() => document.querySelector('.topbar > .icon-button')?.click());
      await page.waitForSelector('.recent', { timeout: 30_000 });
      await page.evaluate(() => document.querySelector('.recent')?.click());
      await page.waitForSelector('.stage-bar', { timeout: 30_000 });
      await settled(page);
    } else console.log('unknown step:', step);
    await page.waitForTimeout(300);
  }
} finally {
  await app.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
