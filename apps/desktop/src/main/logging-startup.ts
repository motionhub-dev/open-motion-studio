// This side effect is imported first, before the film bundler or project sessions initialize.
import { app } from 'electron';
import { release } from 'node:os';
import { join } from 'node:path';
import { log, logFailure, useRuntimeLog } from './log';

try {
  app.setAppLogsPath(process.platform === 'darwin' ? undefined : join(app.getPath('userData'), 'logs'));
  useRuntimeLog(app.getPath('logs'));
  log('app.start', { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged,
    platform: process.platform, arch: process.arch, os: release(), versions: process.versions,
    executable: process.execPath, appPath: app.getAppPath(), resourcesPath: process.resourcesPath, cwd: process.cwd() });
} catch (error) {
  console.error('OpenMotionStudio could not initialize runtime logging:', (error as NodeJS.ErrnoException).code);
}

for (const level of ['log', 'info', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...values: unknown[]) => { log(`console.${level}`, { values }); original(...values); };
}
// Monitor preserves Node's existing exception/exit behavior instead of swallowing a fatal exception.
process.on('uncaughtExceptionMonitor', (error, origin) => logFailure('process.uncaught', error, { origin }));
process.on('warning', warning => logFailure('process.warning', warning));
app.on('before-quit', () => log('app.quitting'));
app.on('quit', (_event, exitCode) => log('app.quit', { exitCode }));
app.on('child-process-gone', (_event, details) => log('process.child-gone', { type: details.type, reason: details.reason, exitCode: details.exitCode }));
app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_event, details) => log('renderer.gone', { id: contents.id, reason: details.reason, exitCode: details.exitCode }));
  contents.on('preload-error', (_event, preloadPath, error) => logFailure('renderer.preload-failed', error, { id: contents.id, preloadPath }));
  contents.on('did-fail-load', (_event, code, description, url, mainFrame) => {
    if (code !== -3) log('renderer.load-failed', { id: contents.id, code, description, url, mainFrame });
  });
});
