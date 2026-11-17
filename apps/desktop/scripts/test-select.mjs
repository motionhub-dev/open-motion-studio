// Exercise the actual React combobox in a hidden Electron window, without a project or credentials.
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'oms-select-test-'));
await build({
  stdin: { resolveDir: desktop, loader: 'tsx', contents: `
    import React, { act, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { Select } from './src/renderer/src/select';
    import './src/renderer/src/styles.css';
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let changes = 0;
    let dirty = 0;
    const options = [{ value: 'system', label: 'Follow system' }, { value: 'blocked', label: 'Unavailable', disabled: true }, { value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }];
    function Harness() {
      const [value, setValue] = useState('system');
      const [typed, setTyped] = useState('');
      return <div style={{ padding: 24 }} onInputCapture={() => dirty++}>
        <div style={{ height: 40, overflow: 'hidden' }}><Select aria-label="Language" value={value} options={options} onValueChange={next => { changes++; setValue(next); }} /></div>
        <Select aria-label="Disabled" value="system" options={options} disabled onValueChange={() => { throw Error('Disabled changed'); }} />
        <Select aria-label="Voice" editable value={typed} options={options} onValueChange={setTyped} />
        <button id="outside">Outside</button>
      </div>;
    }
    const root = createRoot(document.getElementById('root'));
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const action = async fn => { await act(async () => { fn(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
    const key = (control, name) => action(() => control.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
    window.runTests = async () => {
      await act(async () => root.render(<Harness />));
      const language = document.querySelector('[aria-label="Language"]');
      const disabled = document.querySelector('[aria-label="Disabled"]');
      await action(() => disabled.click());
      assert(!document.querySelector('[role="listbox"]'), 'Disabled control opened');
      await action(() => language.click());
      assert(document.querySelector('[role="listbox"]').parentElement === document.body, 'Popup did not escape clipping panel');
      await key(language, 'ArrowDown');
      assert(document.getElementById(language.getAttribute('aria-activedescendant')).textContent === 'English', 'Arrow navigation did not skip disabled option');
      await key(language, 'Enter');
      assert(language.textContent === 'English' && changes === 1 && dirty === 1, 'Keyboard commit or form dirty notification failed');
      await action(() => language.click());
      await key(language, 'End');
      await key(language, 'Escape');
      assert(language.textContent === 'English' && changes === 1 && !document.querySelector('[role="listbox"]'), 'Escape changed value');
      await action(() => language.click());
      await action(() => document.getElementById('outside').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      assert(!document.querySelector('[role="listbox"]'), 'Outside pointer did not dismiss');
      await action(() => language.click());
      await key(language, 'Tab');
      assert(!document.querySelector('[role="listbox"]'), 'Tab did not dismiss');
      await key(language, 'f');
      await key(language, 'Enter');
      assert(language.textContent === 'Follow system', 'Typeahead failed');
      await action(() => language.click());
      await action(() => Array.from(document.querySelectorAll('[role="option"]')).find(item => item.textContent === '简体中文').click());
      assert(language.textContent === '简体中文' && document.activeElement === language, 'Pointer selection or focus restoration failed');
      const voice = document.querySelector('[aria-label="Voice"]');
      await action(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(voice, 'Eng');
        voice.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert(document.querySelectorAll('[role="option"]').length === 1, 'Editable filtering failed');
      await key(voice, 'ArrowDown');
      await key(voice, 'Enter');
      assert(voice.value === 'en', 'Editable selection did not commit the ID');
      await action(() => language.click());
      const rect = document.querySelector('[role="listbox"]').getBoundingClientRect();
      assert(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, 'Popup exceeds viewport');
      await key(language, 'Escape');
      language.style.position = 'fixed'; language.style.bottom = '8px'; language.style.right = '8px';
      await action(() => language.click());
      const above = document.querySelector('[role="listbox"]').getBoundingClientRect();
      assert(above.bottom <= language.getBoundingClientRect().top && above.right <= innerWidth, 'Popup did not flip above the bottom edge');
      document.documentElement.dataset.theme = 'light';
      const light = getComputedStyle(document.querySelector('[role="listbox"]')).backgroundColor;
      document.documentElement.dataset.theme = 'dark';
      assert(getComputedStyle(document.querySelector('[role="listbox"]')).backgroundColor !== light, 'Popup does not follow theme');
      assert(!document.querySelector('select, datalist'), 'Native dropdown remains');
      await act(async () => root.unmount());
      return 'Select smoke test passed: keyboard, pointer, focus, disabled, dirty tracking, filtering, portal, viewport and themes.';
    };
  ` }, bundle: true, outfile: join(temp, 'test.js'), jsx: 'automatic', platform: 'browser', format: 'iife',
});
await writeFile(join(temp, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"></head><body><div id="root"></div><script src="test.js"></script></body></html>');
await writeFile(join(temp, 'runner.cjs'), `
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', ${JSON.stringify(join(temp, 'user-data'))});
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { sandbox: true, contextIsolation: true } });
    try {
      await win.loadFile(${JSON.stringify(join(temp, 'index.html'))});
      console.log(await win.webContents.executeJavaScript('window.runTests()'));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [join(temp, 'runner.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timeout = setTimeout(() => child.kill(), 30000);
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
