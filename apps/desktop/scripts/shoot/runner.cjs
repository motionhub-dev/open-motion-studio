// The website's hero shoot, as Electron's main script on the Xvfb display (shoot.sh): open the "A story in numbers"
// template, choose Claude Code, play, pause on the bars, mark them with a note, send, wait for the agent, play the
// new cut from the start. marks.json keeps the time of each beat for the cut (cut.py).
const { app, BrowserWindow, webContents } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DESKTOP = process.env.OMS_DESKTOP;
const TEMP = process.env.SHOOT_TEMP;
const W = 1920, H = 1080, ZOOM = 1.1;

app.setPath('userData', path.join(TEMP, 'user-data'));
app.setAppPath(DESKTOP);

const marks = [];
const mark = (name) => { marks.push({ name, at: Date.now() }); fs.writeFileSync(path.join(TEMP, 'marks.json'), JSON.stringify(marks, null, 1)); console.log('MARK', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(150); }
  throw new Error('Timed out: ' + label);
}

// The real pointer.
const pointer = spawn('python3', [path.join(__dirname, 'pointer.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
const waiting = [];
pointer.stdout.on('data', (b) => { for (const _ of b.toString().trim().split('\n')) waiting.shift()?.(); });
const say = (line) => new Promise((done) => { waiting.push(done); pointer.stdin.write(line + '\n'); });

// Where an element is on screen. The editor is a view filling the main window, so a page without a window of its
// own is placed in the main one.
const js = (wc, src) => wc.executeJavaScript(src, true);
async function rect(wc, finder) {
  const r = await js(wc, `(() => { const el = (${finder})(); if (!el) return null; const b = el.getBoundingClientRect(); return b.width ? {x:b.x,y:b.y,w:b.width,h:b.height} : null; })()`);
  if (!r) return null;
  const c = (BrowserWindow.fromWebContents(wc) || BrowserWindow.getAllWindows()[0]).getContentBounds();
  const z = wc.getZoomFactor();
  return { x: c.x + r.x * z, y: c.y + r.y * z, w: r.w * z, h: r.h * z };
}
const byLabel = (label) => `() => document.querySelector('[aria-label=${JSON.stringify(label)}]')`;
const byText = (tag, text) => `() => [...document.querySelectorAll(${JSON.stringify(tag)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;
async function go(wc, finder, label, ms = 650) {
  const r = await until(() => rect(wc, finder), label);
  await say(`move ${Math.round(r.x + r.w / 2)} ${Math.round(r.y + r.h / 2)} ${ms}`);
  return r;
}
async function press(wc, finder, label, ms) { await go(wc, finder, label, ms); await sleep(180); await say('click'); await sleep(250); }
async function type(wc, text, perChar = 38) { for (const ch of text) { wc.insertText(ch); await sleep(perChar + (ch === ' ' ? 20 : 0)); } }

require(path.join(DESKTOP, 'out/main/index.js'));

(async () => {
  try {
    await app.whenReady();
    const win = await until(() => BrowserWindow.getAllWindows()[0], 'main window');
    win.setBounds({ x: 0, y: 0, width: W, height: H });
    const home = win.webContents;
    home.setZoomFactor(ZOOM);
    await until(async () => !home.isLoading() && (await js(home, '!!document.querySelector(".home-template")')), 'home', 30000);
    await sleep(1500);
    mark('home');

    await press(home, `() => [...document.querySelectorAll('.home-template')].find(e => /story in numbers/i.test(e.textContent))`, 'template', 900);
    await sleep(1800);
    await press(home, byText('button', 'Use this template'), 'use template', 800);
    mark('project-opening');

    const wc = await until(async () => {
      for (const c of webContents.getAllWebContents()) {
        if (c === home || c.isDestroyed()) continue;
        if (await js(c, '!!document.querySelector(".agent-chip")').catch(() => false)) return c;
      }
      return null;
    }, 'editor', 30000);
    wc.setZoomFactor(ZOOM);
    await sleep(2500);
    mark('editor');

    await press(wc, `() => document.querySelector('.agent-chip')`, 'agent chip', 800);
    await sleep(600);
    await press(wc, `() => [...document.querySelectorAll('.agent-menu [role=menuitemradio]')].find(e => /Claude Code/.test(e.textContent))`, 'claude code', 600);
    await sleep(800);
    mark('agent-chosen');

    // Play the first cut and pause about 3.1 s in: the bars are up, before the second scene.
    await press(wc, byLabel('Play'), 'play', 900);
    mark('play-v1');
    await sleep(2300);
    await press(wc, byLabel('Pause'), 'pause', 300);
    mark('paused');
    await sleep(700);

    await press(wc, byLabel('Mark a region'), 'region', 800);
    const frame = await until(() => rect(wc, `() => document.querySelector('iframe[title="Film preview"]')`), 'film frame');
    await say(`move ${Math.round(frame.x + frame.w * 0.05)} ${Math.round(frame.y + frame.h * 0.16)} 900`);
    await sleep(200);
    mark('drag');
    await say('down');
    await say(`move ${Math.round(frame.x + frame.w * 0.47)} ${Math.round(frame.y + frame.h * 0.45)} 1100`);
    await say('up');
    await sleep(700);

    await press(wc, byLabel('What should change here'), 'note', 500);
    mark('note');
    await type(wc, 'Make the tallest bar vermilion, and let the bars rise one after another.');
    await sleep(600);
    await press(wc, byText('button', 'Add mark'), 'add mark', 600);
    await sleep(900);

    await press(wc, `() => document.querySelector('textarea[placeholder^="Ask for a film"], .composer textarea')`, 'composer', 800);
    await type(wc, 'Keep everything else as it is.', 34);
    await sleep(500);
    if (process.env.DRY) { mark('dry-end'); await sleep(1500); return; }
    await press(wc, byLabel('Send'), 'send', 600);
    mark('sent');

    await sleep(4000);
    await until(async () => !(await js(wc, '!!document.querySelector(".send.stop")')), 'agent done', 12 * 60 * 1000);
    mark('agent-done');
    await sleep(2500);

    // The new cut from the start (Home), the pointer out of the way.
    await say(`move ${Math.round(frame.x + frame.w * 0.6)} ${Math.round(frame.y + frame.h * 0.6)} 700`);
    await js(wc, 'document.activeElement && document.activeElement.blur()');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Home' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Home' });
    await sleep(400);
    await press(wc, byLabel('Play'), 'play again', 700);
    mark('play-v2');
    await sleep(8500);
    mark('end');
    await sleep(800);
  } catch (e) {
    console.error('SHOOT FAILED', e);
    mark('failed');
  } finally {
    pointer.stdin.end();
    app.exit(0);
  }
})();
