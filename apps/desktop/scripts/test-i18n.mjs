// Verify Chinese UI and live language changes in an isolated, hidden Electron window.
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'oms-i18n-test-'));
await build({
  stdin: { resolveDir: desktop, loader: 'tsx', contents: `import './scripts/fixtures/i18n';` }, loader: { '.png': 'dataurl' }, bundle: true,
  // Vite bundles the rendered templates (home.tsx); this smoke test plays none of them.
  define: { 'import.meta.glob': 'globalThis.noTemplates' }, banner: { js: 'globalThis.noTemplates = () => ({});' }, outfile: join(temp, 'test.js'), jsx: 'automatic', platform: 'browser', format: 'iife',
});
await writeFile(join(temp, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"></head><body><div id="root"></div><script src="test.js"></script></body></html>');
await writeFile(join(temp, 'runner.cjs'), `
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', ${JSON.stringify(join(temp, 'user-data'))});
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: !!process.env.UI_SCREENSHOT } });
    try {
      await win.loadFile(${JSON.stringify(join(temp, 'index.html'))});
      console.log(await win.webContents.executeJavaScript('window.runTests()'));
      if (process.env.UI_SCREENSHOT) {
        await win.webContents.executeJavaScript('window.previewHome()');
        win.webContents.invalidate();
        await new Promise(resolve => setTimeout(resolve, 250));
        require('node:fs').writeFileSync(process.env.UI_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      }
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [join(temp, 'runner.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timeout = setTimeout(() => child.kill(), 30000);
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
