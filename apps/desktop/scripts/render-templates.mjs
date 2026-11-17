// Renders each bundled template (src/main/examples.ts) through the Studio's own export, then keeps a small MP4 and a
// poster frame of it beside the renderer (src/renderer/src/templates/), where Home plays them. manifest.json holds the
// hash of each template's film.tsx, so a test fails when a template changes and its video was not rendered again.
// Run after a build: `pnpm templates`.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import ffmpeg from 'ffmpeg-static';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(desktop, 'src', 'renderer', 'src', 'templates');
/** The moment a template's poster is taken: its first scene, settled (home.tsx shows the same). */
const POSTER_AT = 2.4;
const temp = await mkdtemp(join(tmpdir(), 'oms-templates-'));
await mkdir(join(temp, 'user-data'));
await writeFile(join(temp, 'user-data', 'settings.json'), JSON.stringify({
  providers: [], active: null, workspace: join(temp, 'projects'),
  preferences: { language: 'en', theme: 'light', onboardingComplete: true, backgroundNoticeSeen: true },
}));
await writeFile(join(temp, 'runner.cjs'), `
const { app, BrowserWindow, dialog, webContents } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const temp = ${JSON.stringify(temp)};
app.setPath('userData', path.join(temp, 'user-data'));
app.setAppPath(${JSON.stringify(desktop)});
app.on('browser-window-created', (_, win) => { win.show = () => {}; win.focus = () => {}; win.webContents.setBackgroundThrottling(false); });
// The export asks where to save; this run answers with the file it is rendering.
let target = null;
dialog.showSaveDialog = async () => ({ canceled: !target, filePath: target });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn, label, tries = 600) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await sleep(200);
  }
  throw new Error('Timed out: ' + label + (last ? ' (' + last.message + ')' : ''));
}
const js = (wc, source) => wc.executeJavaScript(source, true);
require(${JSON.stringify(join(desktop, 'out', 'main', 'index.js'))});
(async () => {
  await app.whenReady();
  const win = await until(() => BrowserWindow.getAllWindows()[0], 'main window');
  const home = win.webContents;
  await until(async () => !home.isLoading() && await js(home, '!!window.studio'), 'home');
  const examples = await js(home, 'window.studio.examples()');
  const manifest = {};
  for (const example of examples) {
    const known = new Set(webContents.getAllWebContents().map((w) => w.id));
    await js(home, 'window.studio.openExample(' + JSON.stringify(example.id) + ')');
    const editor = await until(() => webContents.getAllWebContents().find((w) => !known.has(w.id) && w.getURL() === home.getURL()), example.id + ' editor');
    const project = await until(() => js(editor, 'window.studio.currentProject()'), example.id + ' project');
    target = path.join(temp, example.id + '.mp4');
    // The export refuses until the film has built; ask again until it takes.
    await until(() => js(editor, 'window.studio.exportFilm()'), example.id + ' export');
    target = null;
    const source = await fs.readFile(path.join(project.path, 'film.tsx'), 'utf8');
    manifest[example.id] = { seconds: example.seconds, film: createHash('sha256').update(source).digest('hex') };
    console.log('Exported ' + example.id);
    await js(editor, 'window.studio.closeProject()');
    await sleep(300);
  }
  await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\\n');
  app.exit(0);
})().catch((error) => { console.error(error); app.exit(1); });
`);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const code = await new Promise((done) => {
  const child = spawn(electron, [join(temp, 'runner.cjs')], { env, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => child.kill(), 10 * 60_000);
  child.on('error', (error) => { console.error(error); done(1); });
  child.on('exit', (exit) => { clearTimeout(timer); done(exit ?? 1); });
});
if (code) {
  console.error('Rendering failed; its files are in ' + temp);
  process.exit(code);
}

// Home shows a template at most a few hundred pixels wide: 960 px, no sound or subtitles, small enough to bundle.
const manifest = JSON.parse(await readFile(join(temp, 'manifest.json'), 'utf8'));
await mkdir(out, { recursive: true });
const run = (args) => {
  const result = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
};
for (const id of Object.keys(manifest)) {
  const full = join(temp, `${id}.mp4`);
  run(['-i', full, '-an', '-sn', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `${id}.mp4`)]);
  run(['-ss', String(POSTER_AT), '-i', full, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', join(out, `${id}.jpg`)]);
  console.log(`Kept ${id}.mp4 and ${id}.jpg`);
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await rm(temp, { recursive: true, force: true });
console.log('Templates rendered into ' + out);
