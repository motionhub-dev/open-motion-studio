// The main process: the window, the open project, and the handlers behind every
// StudioApi method. It is the only process that touches the disk; the renderer is
// sandboxed and reaches it only through src/preload (CLAUDE.md, "Architecture rules").

import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  session,
  shell,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';
import type { BuildContext } from 'esbuild';
import { join } from 'node:path';
import { CHANNELS, EVENTS, type BuildResult, type Project } from '../shared/api';
import { exportFilm, serveRenders } from './engines/capture';
import { startFilm, watchFilm } from './engines/native';
import { registerPreviewScheme, servePreview } from './engines/preview';
import { createProject, isRecent, openProject, projectAt, recentProjects, rememberProject } from './project';

const recentsFile = (): string => join(app.getPath('userData'), 'recent-projects.json');

/** The project open in the window, and its film's bundler. One window, one project. */
let open: { project: Project; watcher: BuildContext | null; build: BuildResult | null } | null = null;
let mainWindow: BrowserWindow | null = null;
let exporting: AbortController | null = null;

const projectDir = (): string | null => open?.project.path ?? null;

function send(channel: string, value: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}

async function closeOpen(): Promise<void> {
  exporting?.abort();
  const watcher = open?.watcher;
  open = null;
  await watcher?.dispose();
}

/** Makes `project` the open one: remembers it and, for a film, starts bundling it. */
async function use(project: Project): Promise<Project> {
  await closeOpen();
  await rememberProject(recentsFile(), project);
  const state: NonNullable<typeof open> = { project, watcher: null, build: null };
  open = state;
  if (project.engine === 'native') {
    state.watcher = await watchFilm(project.path, (result) => {
      if (open !== state) return;
      state.build = result;
      send(EVENTS.build, result);
    });
  }
  return project;
}

/** Asks for one folder, over the window that asked; null when the person cancels. */
async function chooseFolder(sender: WebContents, options: OpenDialogOptions): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender);
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

function requireOpen(): NonNullable<typeof open> {
  if (!open) throw new Error('No project is open.');
  return open;
}

function registerHandlers(): void {
  ipcMain.handle(CHANNELS.recentProjects, () => recentProjects(recentsFile()));

  ipcMain.handle(CHANNELS.openProject, async (event) => {
    const path = await chooseFolder(event.sender, { title: 'Open a project folder', properties: ['openDirectory'] });
    return path === null ? null : use(await openProject(path));
  });

  ipcMain.handle(CHANNELS.createProject, async (event) => {
    const path = await chooseFolder(event.sender, {
      title: 'Choose an empty folder for the new project',
      buttonLabel: 'Create project',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (path === null) return null;
    const project = await createProject(path);
    await startFilm(project.path);
    return use(projectAt(project.path));
  });

  ipcMain.handle(CHANNELS.openRecent, async (_event, path: unknown) => {
    // The renderer may name a path only from the list the main process gave it.
    if (typeof path !== 'string' || !(await isRecent(recentsFile(), path))) {
      throw new Error('That folder is not on the recent list.');
    }
    return use(await openProject(path));
  });

  ipcMain.handle(CHANNELS.startFilm, async () => {
    const { project } = requireOpen();
    await startFilm(project.path);
    return use(projectAt(project.path));
  });

  ipcMain.handle(CHANNELS.closeProject, () => closeOpen());

  ipcMain.handle(CHANNELS.lastBuild, () => open?.build ?? null);

  ipcMain.handle(CHANNELS.exportFilm, async (event) => {
    const state = requireOpen();
    if (exporting) throw new Error('An export is already running.');
    const build = state.build;
    if (!build?.ok) throw new Error('The film does not build: fix its errors before exporting.');
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export the film',
      defaultPath: join(state.project.path, `${state.project.name}.mp4`),
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    const controller = new AbortController();
    exporting = controller;
    try {
      await exportFilm(build.version, result.filePath, (done) => send(EVENTS.exportProgress, done), controller.signal);
      return result.filePath;
    } finally {
      exporting = null;
    }
  });

  ipcMain.handle(CHANNELS.cancelExport, () => exporting?.abort());
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Open Motion Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    void closeOpen();
  });

  // The app never opens a second window and never navigates away from its own page;
  // an http(s) link is handed to the person's browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServer) void window.loadURL(devServer);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
}

registerPreviewScheme();

void app.whenReady().then(() => {
  servePreview(session.defaultSession, projectDir);
  serveRenders(projectDir);
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
