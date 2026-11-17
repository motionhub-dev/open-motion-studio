// One tray-backed main window, with project-owned editor views that can move into dedicated windows.

import './logging-startup';
import { BaseWindow, BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, webContents, session, shell, type Session, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, realpath, open as openFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CHANNELS, EVENTS, MAX_BRIEF, type Project, type ProjectTask } from '../shared/api';
import { keepFilmsInPlace, registerPreviewScheme, SCHEME, servePreview } from './film/preview';
import { startFilm } from './film/film';
import { openExample } from './examples';
import { createInWorkspace, filmName, forgetProject, inLibrary, openProject, projectAt, projectLibrary, rememberProject } from './project';
import { providers, studioTranslator } from './providers';
import { createWorkspace, type WorkspaceHost } from './workspace';
import { WebContentsView } from 'electron';
import { log, logFailure } from './log';

type Workspace = ReturnType<typeof createWorkspace>;
interface Editor {
  project: Project;
  view: WebContentsView;
  workspace: Workspace;
  renderSession: Session;
  host: BaseWindow | null;
  window: BaseWindow | null;
  ready: Promise<void>;
  openedAt: number;
  /** What the person asked for when they created the project from Home, until its editor takes it. */
  brief: string | null;
}
const surfaces = new Map<number, Workspace>();
const editors = new Map<string, Editor>();
let mainWindow: BrowserWindow;
let homeWorkspace: Workspace;
let homeRenderSession: Session;
let activeEditor: Editor | null = null;
let tray: Tray;
let quitting = false;
let quitReady = false;
let taskUpdate: NodeJS.Timeout | undefined;
const libraryFile = () => join(app.getPath('userData'), 'projects.json');
const icon = () => join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const workspaceSettings = () => providers().workspace(join(app.getPath('documents'), 'OpenMotionStudio'));

function taskList(): ProjectTask[] {
  return [...editors.values()].map((entry) => ({
    ...(entry.workspace.task() ?? {
      project: entry.project, kind: 'work' as const, status: 'idle' as const,
      title: 'Ready to create', activity: 'Ready', startedAt: entry.openedAt, updatedAt: entry.openedAt,
    }),
    background: !entry.host || !entry.host.isVisible(),
  })).sort((a, b) => b.updatedAt - a.updatedAt);
}

function changed(): void {
  if (quitting || taskUpdate) return;
  taskUpdate = setTimeout(() => {
    taskUpdate = undefined;
    const tasks = taskList();
    for (const id of surfaces.keys()) {
      const contents = id === mainWindow.webContents.id ? mainWindow.webContents
        : [...editors.values()].find((e) => e.view.webContents.id === id)?.view.webContents;
      if (contents && !contents.isDestroyed()) contents.send(EVENTS.tasks, tasks);
    }
    void showTasksInTray(tasks).catch((error) => logFailure('tray.update', error));
  }, 150);
}

/**
 * The tray, and the dock or launcher badge where the system has one, say how many tasks need the person and how many
 * run, in the interface's language; each project that needs them is one click away in the tray's menu.
 */
async function showTasksInTray(tasks: ProjectTask[]): Promise<void> {
  if (!tray || tray.isDestroyed()) return;
  const tr = await studioTranslator();
  const waiting = tasks.filter((task) => task.status === 'waiting');
  const running = tasks.filter((task) => task.status === 'running').length;
  tray.setToolTip(waiting.length || running
    ? `OpenMotionStudio · ${tr('{0} need attention · {1} running', { 0: waiting.length, 1: running })}`
    : 'OpenMotionStudio');
  tray.setContextMenu(Menu.buildFromTemplate([
    ...waiting.map((task) => ({
      label: tr('{0} needs you', { 0: task.project.name }),
      click: () => void openKnown(task.project.path, false).catch((error) => logFailure('tray.open', error)),
    })),
    ...(waiting.length ? [{ type: 'separator' as const }] : []),
    { label: tr('Open OpenMotionStudio'), click: showMain },
    { label: tr('Home'), click: showHome },
    { type: 'separator' },
    { label: tr('Quit OpenMotionStudio'), click: () => app.quit() },
  ]));
  if (process.platform === 'darwin') tray.setTitle(waiting.length ? String(waiting.length) : '');
  app.setBadgeCount(waiting.length);
}

function secure(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
  keepFilmsInPlace(contents);
}

async function loadUI(contents: WebContents): Promise<void> {
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServer) await contents.loadURL(devServer);
  else await contents.loadFile(join(__dirname, '../renderer/index.html'));
}

function fit(entry: Editor): void {
  if (!entry.host || entry.host.isDestroyed()) return;
  const [width = 960, height = 600] = entry.host.getContentSize();
  entry.view.setBounds({ x: 0, y: 0, width, height });
}

function detach(entry: Editor): void {
  entry.view.webContents.send(EVENTS.viewVisibility, false);
  if (entry.host && !entry.host.isDestroyed()) entry.host.contentView.removeChildView(entry.view);
  entry.view.setVisible(false);
  if (activeEditor === entry) { activeEditor = null; mainWindow.setTitle('OpenMotionStudio'); }
  entry.host = null;
}

function showMain(): void {
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}

/** Tells every Studio surface that app-wide state changed; settings events say whether another surface changed it. */
function broadcast(event: typeof EVENTS.preferences | typeof EVENTS.settings, from?: number): void {
  for (const id of surfaces.keys()) webContents.fromId(id)?.send(event, ...(from === undefined ? [] : [id !== from]));
}
const SETTINGS_CHANNELS: string[] = [
  CHANNELS.saveProvider, CHANNELS.removeProvider, CHANNELS.activateProvider, CHANNELS.saveAgentSettings, CHANNELS.saveVoice, CHANNELS.removeVoice,
];

function showHome(): void {
  if (activeEditor) detach(activeEditor);
  mainWindow.setTitle('OpenMotionStudio');
  mainWindow.webContents.send(EVENTS.viewVisibility, true);
  showMain(); mainWindow.webContents.focus(); changed();
}

function openInMain(entry: Editor): void {
  if (activeEditor && activeEditor !== entry) detach(activeEditor);
  const separate = entry.window;
  detach(entry);
  entry.window = null;
  if (separate && !separate.isDestroyed()) separate.destroy();
  entry.host = mainWindow;
  activeEditor = entry;
  mainWindow.contentView.addChildView(entry.view);
  entry.view.setVisible(true); fit(entry);
  mainWindow.setTitle(`${entry.project.name} — OpenMotionStudio`);
  showMain(); entry.view.webContents.focus(); changed();
}

function openSeparate(entry: Editor): void {
  if (entry.window && !entry.window.isDestroyed()) {
    if (entry.window.isMinimized()) entry.window.restore();
    entry.window.show(); entry.window.focus(); return;
  }
  detach(entry);
  const window = new BaseWindow({ width: 1440, height: 900, minWidth: 960, minHeight: 600,
    title: `${entry.project.name} — OpenMotionStudio`, icon: icon(), show: false });
  entry.window = window; entry.host = window;
  window.contentView.addChildView(entry.view);
  entry.view.setVisible(true); fit(entry);
  window.on('resize', () => fit(entry));
  window.on('hide', () => entry.view.webContents.send(EVENTS.viewVisibility, false));
  window.on('close', () => {
    // The view and its pending IPC calls belong to the project, not this native window.
    if (entry.host === window) detach(entry);
    if (entry.window === window) entry.window = null;
    changed();
  });
  window.show(); window.focus(); entry.view.webContents.focus(); changed();
}

async function editorFor(project: Project, brief: string | null = null): Promise<Editor> {
  const resolved = await realpath(project.path);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const existing = editors.get(key);
  if (existing) { await existing.ready; return existing; }
  const partition = `oms-project-${randomUUID()}`;
  const renderSession = session.fromPartition(`${partition}-render`);
  const view = new WebContentsView({ webPreferences: {
    partition, preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true,
    nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required',
  } });
  let entry: Editor;
  const host: WorkspaceHost = {
    webContents: view.webContents,
    window: () => entry?.host ?? mainWindow,
    isDestroyed: () => view.webContents.isDestroyed(),
    isFocused: () => !!entry?.host?.isFocused(),
    isVisible: () => !!entry?.host?.isVisible(),
    isMinimized: () => !!entry?.host?.isMinimized(),
    restore: () => entry?.host?.restore(),
    focus: () => entry.host ? entry.host.focus() : openInMain(entry),
    flashFrame: (flash) => entry?.host?.flashFrame(flash),
    setTitle: (title) => entry?.host?.setTitle(title),
  };
  const workspace = createWorkspace(host, renderSession, changed);
  entry = { project, view, workspace, renderSession, host: null, window: null, ready: Promise.resolve(), openedAt: Date.now(), brief };
  editors.set(key, entry); surfaces.set(view.webContents.id, workspace);
  secure(view.webContents);
  servePreview(view.webContents.session, workspace.previewSource);
  servePreview(renderSession, workspace.previewSource);
  entry.ready = (async () => {
    await workspace.open(project);
    await loadUI(view.webContents);
  })();
  try { await entry.ready; }
  catch (error) {
    editors.delete(key); surfaces.delete(view.webContents.id);
    await workspace.dispose();
    view.webContents.session.protocol.unhandle(SCHEME); renderSession.protocol.unhandle(SCHEME);
    view.webContents.close(); throw error;
  }
  changed(); return entry;
}

async function openKnown(path: unknown, separate: unknown): Promise<void> {
  if (typeof path !== 'string' || (separate !== undefined && typeof separate !== 'boolean')) throw new Error('Choose a project to open.');
  const known = [...editors.values()].find((e) => e.project.path === path);
  if (!known && !(await inLibrary(libraryFile(), path))) throw new Error('That project is not in your library.');
  const entry = known ?? await editorFor(await openProject(path));
  await entry.ready;
  if (known) await rememberProject(libraryFile(), entry.project);
  if (separate) openSeparate(entry); else openInMain(entry);
}

async function createMain(): Promise<void> {
  const partition = `oms-home-${randomUUID()}`;
  homeRenderSession = session.fromPartition(`${partition}-render`);
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, show: false,
    title: 'OpenMotionStudio', icon: icon(),
    webPreferences: { partition, preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  homeWorkspace = createWorkspace(mainWindow, homeRenderSession, changed);
  surfaces.set(mainWindow.webContents.id, homeWorkspace);
  secure(mainWindow.webContents);
  let explainingClose = false;
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (explainingClose) return;
    explainingClose = true;
    void (async () => {
      if (!(await providers().preferences()).backgroundNoticeSeen) {
        const tr = await studioTranslator();
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'OpenMotionStudio', message: tr('Keep working in the background?'),
          detail: tr('Active tasks continue after this window closes. Use the tray icon to reopen OpenMotionStudio or quit.'),
          buttons: [tr('Keep in background'), tr('Keep window open')], defaultId: 0, cancelId: 1,
          checkboxLabel: tr('Do not show again'), checkboxChecked: true,
        });
        if (result.response !== 0) return;
        if (result.checkboxChecked) await providers().savePreferences({backgroundNoticeSeen:true});
      }
      mainWindow.hide(); changed();
    })().catch(error => { logFailure('window.close', error); }).finally(() => { explainingClose = false; });
  });
  mainWindow.on('hide', () => { activeEditor?.view.webContents.send(EVENTS.viewVisibility, false); });
  mainWindow.on('resize', () => { if (activeEditor) fit(activeEditor); });
  mainWindow.once('ready-to-show', showMain);
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'icon.png')).resize({ width: 20, height: 20 }));
  await showTasksInTray([]);
  tray.on('double-click', showMain);
  if (process.platform === 'win32') tray.on('click', showMain);
  await loadUI(mainWindow.webContents);
}

registerPreviewScheme();
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else {
  app.on('second-instance', () => { void app.whenReady().then(() => { if (mainWindow) showMain(); }); });
  app.on('before-quit', (event) => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    if (taskUpdate) clearTimeout(taskUpdate);
    void (async () => {
      await Promise.allSettled([homeWorkspace, ...[...editors.values()].map(e => e.workspace)].filter(Boolean).map(w => w.dispose()));
      for (const entry of editors.values()) {
        detach(entry);
        if (entry.window && !entry.window.isDestroyed()) entry.window.destroy();
        entry.view.webContents.session.protocol.unhandle(SCHEME);
        entry.renderSession.protocol.unhandle(SCHEME);
        entry.view.webContents.close();
      }
      tray?.destroy();
      quitReady = true;
      app.quit();
    })().catch(error => { console.error('OpenMotionStudio could not finish shutting down:', error); quitReady = true; app.quit(); });
  });
  void app.whenReady().then(async () => {
    for (const channel of Object.values(CHANNELS)) ipcMain.handle(channel, async (event, ...args) => {
      const started = Date.now();
      try {
        const workspace = surfaces.get(event.sender.id);
        if (quitting || !workspace || event.senderFrame !== event.sender.mainFrame) throw new Error('This view cannot call the Studio.');
        const entry = [...editors.values()].find(e => e.view.webContents.id === event.sender.id);
        if (channel === CHANNELS.projectLibrary) return projectLibrary(libraryFile());
        if (channel === CHANNELS.validateWorkspace) {
          const { path } = await workspaceSettings();
          await mkdir(path, { recursive: true });
          const probe = join(path, `.studio-write-check-${randomUUID()}`);
          const handle = await openFile(probe, 'wx');
          try { await handle.close(); } finally { await rm(probe, { force: true }); }
          return;
        }
        if (channel === CHANNELS.libraryAction) {
          const [path, action] = args;
          if (typeof path !== 'string' || !(await inLibrary(libraryFile(), path))) throw new Error('That project is not in your library.');
          if (action === 'remove') await forgetProject(libraryFile(), path);
          else if (action === 'show') { const error = await shell.openPath(path); if (error) throw new Error(error); }
          else if (action === 'locate') {
            const result = await dialog.showOpenDialog(entry?.host ?? mainWindow, { properties: ['openDirectory'], title: (await studioTranslator())('Locate project folder') });
            if (!result.canceled && result.filePaths[0]) {
              const next = await openProject(result.filePaths[0]);
              await rememberProject(libraryFile(), next);
              if (next.path !== path) await forgetProject(libraryFile(), path);
            }
          } else throw new Error('Invalid library action.');
          return;
        }
        if (channel === CHANNELS.preferences) return await providers().preferences();
        if (channel === CHANNELS.savePreferences) {
          const next = await providers().savePreferences(args[0]);
          broadcast(EVENTS.preferences);
          changed(); // the tray speaks the interface's language
          return next;
        }
        if (channel === CHANNELS.systemStartup || channel === CHANNELS.setSystemStartup) {
          const supported = app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
          if (channel === CHANNELS.setSystemStartup) {
            if (typeof args[0] !== 'boolean') throw new Error('Invalid startup setting.');
            if (!supported) throw new Error('Launch at login is available in installed Windows and macOS builds.');
            app.setLoginItemSettings({ openAtLogin: args[0] });
          }
          const enabled = supported && app.getLoginItemSettings().openAtLogin;
          if (channel === CHANNELS.setSystemStartup && enabled !== args[0]) throw new Error('The operating system did not apply the startup setting. Check your system login items.');
          if (channel === CHANNELS.setSystemStartup) broadcast(EVENTS.preferences);
          return { supported, enabled };
        }
        if (channel === CHANNELS.showLogs) {
          const error = await shell.openPath(app.getPath('logs'));
          if (error) throw new Error(error);
          return;
        }
        if (channel === CHANNELS.workspace) return await workspaceSettings();
        if (channel === CHANNELS.chooseWorkspace) {
          const tr = await studioTranslator();
          const result = await dialog.showOpenDialog(entry?.host ?? mainWindow, {
            title: tr('Choose your workspace folder'), buttonLabel: tr('Use workspace'),
            defaultPath: (await workspaceSettings()).path, properties: ['openDirectory', 'createDirectory'],
          });
          if (result.canceled || !result.filePaths[0]) return null;
          await mkdir(result.filePaths[0], { recursive: true });
          const next = await providers().setWorkspace(await realpath(result.filePaths[0]));
          broadcast(EVENTS.settings, event.sender.id);
          return next;
        }
        if (channel === CHANNELS.takeBrief) {
          const brief = entry?.brief ?? null;
          if (entry) entry.brief = null;
          return brief;
        }
        if (channel === CHANNELS.tasks) return taskList();
        if (channel === CHANNELS.openTask) return await openKnown(args[0], args[1]);
        if (channel === CHANNELS.newWindow) { if (entry) openSeparate(entry); else if (activeEditor) openSeparate(activeEditor); else showHome(); return; }
        if (channel === CHANNELS.closeProject) {
          if (entry?.window) entry.window.close();
          showHome(); return;
        }
        if ([CHANNELS.openProject, CHANNELS.createProject, CHANNELS.openRecent, CHANNELS.openExample].includes(channel as never)) {
          let project: Project;
          let brief: string | null = null;
          if (channel === CHANNELS.openRecent) { await openKnown(args[0], false); return null; }
          if (channel === CHANNELS.openExample) project = await openExample((await workspaceSettings()).path, args[0]);
          else if (channel === CHANNELS.createProject) {
            if (args[0] !== undefined) {
              if (typeof args[0] !== 'string' || !args[0].trim() || args[0].length > MAX_BRIEF) throw new Error('Describe the film in a few words.');
              brief = args[0].trim();
            }
            project = await createInWorkspace((await workspaceSettings()).path, brief ? filmName(brief) : undefined);
            await startFilm(project.path);
            project = projectAt(project.path);
          } else {
            const result = await dialog.showOpenDialog(entry?.host ?? mainWindow, {
              title: (await studioTranslator())('Open a project folder'), properties: ['openDirectory'],
            });
            if (result.canceled || !result.filePaths[0]) return null;
            project = await openProject(result.filePaths[0]);
          }
          openInMain(await editorFor(project, brief)); return null;
        }
        const handler = workspace.handlers.get(channel);
        if (!handler) throw new Error('This Studio action is not available.');
        const result = await handler(event, ...args);
        if (SETTINGS_CHANNELS.includes(channel)) broadcast(EVENTS.settings, event.sender.id);
        return result;
      } catch (error) {
        logFailure('ipc.failed', error, { channel, elapsedMs: Date.now() - started });
        throw error;
      }
    });
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'File', submenu: [{ label: 'Open in Editor Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => { if (activeEditor) openSeparate(activeEditor); } }] },
      { role: 'editMenu' }, { role: 'windowMenu' },
    ]) : null);
    await createMain();
    log('app.ready');
    app.on('activate', showMain);
  });
}
