// The main process: the window, and the handlers behind every StudioApi method.
// It is the only process that touches the disk; the renderer is sandboxed and
// reaches it only through src/preload (CLAUDE.md, "Architecture rules").

import { BrowserWindow, app, dialog, ipcMain, shell, type OpenDialogOptions, type WebContents } from 'electron';
import { join } from 'node:path';
import { CHANNELS, type Project } from '../shared/api';
import { createProject, isRecent, openProject, recentProjects, rememberProject } from './project';

const recentsFile = (): string => join(app.getPath('userData'), 'recent-projects.json');

async function remembered(project: Project): Promise<Project> {
  await rememberProject(recentsFile(), project);
  return project;
}

/** Asks for one folder, over the window that asked; null when the person cancels. */
async function chooseFolder(sender: WebContents, options: OpenDialogOptions): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender);
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

function registerHandlers(): void {
  ipcMain.handle(CHANNELS.recentProjects, () => recentProjects(recentsFile()));

  ipcMain.handle(CHANNELS.openProject, async (event) => {
    const path = await chooseFolder(event.sender, {
      title: 'Open a project folder',
      properties: ['openDirectory'],
    });
    return path === null ? null : remembered(await openProject(path));
  });

  ipcMain.handle(CHANNELS.createProject, async (event) => {
    const path = await chooseFolder(event.sender, {
      title: 'Choose an empty folder for the new project',
      buttonLabel: 'Create project',
      properties: ['openDirectory', 'createDirectory'],
    });
    return path === null ? null : remembered(await createProject(path));
  });

  ipcMain.handle(CHANNELS.openRecent, async (_event, path: unknown) => {
    // The renderer may name a path only from the list the main process gave it.
    if (typeof path !== 'string' || !(await isRecent(recentsFile(), path))) {
      throw new Error('That folder is not on the recent list.');
    }
    return remembered(await openProject(path));
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'Open Motion Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => window.show());

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

void app.whenReady().then(() => {
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
