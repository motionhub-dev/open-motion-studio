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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHANNELS, EVENTS, type AgentEvent, type BuildResult, type Project } from '../shared/api';
import { runTurn, transcript } from './agent/loop';
import { markedMessage, readMarks } from './agent/marks';
import { type MessageParam, caller, failure } from './agent/model';
import { TOOLS, type ToolContext } from './agent/tools';
import { openStage, serveRenders } from './engines/capture';
import { type Bundler, type Engine, engineById } from './engines/engine';
import { native } from './engines/native';
import { type PreviewSource, registerPreviewScheme, servePreview } from './engines/preview';
import { projectMotions, searchMotions, useMotion } from './motions';
import { STATE_DIR, createProject, isRecent, openProject, projectAt, recentProjects, rememberProject } from './project';
import { ProviderStore } from './providers';

const recentsFile = (): string => join(app.getPath('userData'), 'recent-projects.json');
let providerStore: ProviderStore | null = null;
const providers = (): ProviderStore => (providerStore ??= new ProviderStore(app.getPath('userData')));

/** The project open in the window, its engine, its film's bundler and its conversation. One window, one project. */
let open: {
  project: Project;
  engine: Engine | null;
  watcher: Bundler | null;
  build: BuildResult | null;
  messages: MessageParam[] | null;
} | null = null;
let mainWindow: BrowserWindow | null = null;
let exporting: AbortController | null = null;
let working: AbortController | null = null;

const sessionFile = (dir: string): string => join(dir, STATE_DIR, 'session.json');

/** The open project's conversation, read from disk the first time it is asked for. */
async function conversation(state: NonNullable<typeof open>): Promise<MessageParam[]> {
  if (state.messages) return state.messages;
  try {
    state.messages = JSON.parse(await readFile(sessionFile(state.project.path), 'utf8')) as MessageParam[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state.messages = [];
  }
  return state.messages;
}

async function saveConversation(dir: string, messages: MessageParam[]): Promise<void> {
  await mkdir(join(dir, STATE_DIR), { recursive: true });
  await writeFile(sessionFile(dir), JSON.stringify(messages));
}

const previewSource = (): PreviewSource | null => (open?.engine ? { dir: open.project.path, engine: open.engine } : null);

function send(channel: string, value: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}

async function closeOpen(): Promise<void> {
  exporting?.abort();
  working?.abort();
  const watcher = open?.watcher;
  open = null;
  await watcher?.dispose();
}

/** Makes `project` the open one: remembers it and, for a film, starts bundling it. */
async function use(project: Project): Promise<Project> {
  await closeOpen();
  await rememberProject(recentsFile(), project);
  const engine = project.engine ? engineById(project.engine) : null;
  const state: NonNullable<typeof open> = { project, engine, watcher: null, build: null, messages: null };
  open = state;
  if (engine) {
    state.watcher = await engine.watch(project.path, (result) => {
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

/** Takes a motion into the open project, and lets its engine turn it into files of its own. */
async function takeMotion(state: NonNullable<typeof open>, id: unknown) {
  const taken = await useMotion(state.project.path, id);
  await state.engine?.motionTaken(state.project.path);
  return taken;
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

  ipcMain.handle(CHANNELS.createProject, async (event, id: unknown) => {
    const engine = engineById(id);
    const path = await chooseFolder(event.sender, {
      title: 'Choose an empty folder for the new project',
      buttonLabel: 'Create project',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (path === null) return null;
    const project = await createProject(path);
    await engine.create(project.path, (line) => send(EVENTS.createProgress, line));
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
    await native.create(project.path, () => {});
    return use(projectAt(project.path));
  });

  ipcMain.handle(CHANNELS.closeProject, () => closeOpen());

  ipcMain.handle(CHANNELS.lastBuild, () => open?.build ?? null);

  ipcMain.handle(CHANNELS.projectMotions, () => projectMotions(requireOpen().project.path));
  ipcMain.handle(CHANNELS.searchMotions, (_event, words: unknown) => searchMotions(typeof words === 'string' ? words : ''));
  ipcMain.handle(CHANNELS.useMotion, (_event, id: unknown) => takeMotion(requireOpen(), id));

  ipcMain.handle(CHANNELS.providers, () => providers().list());
  ipcMain.handle(CHANNELS.saveProvider, (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Not a provider.');
    return providers().save(input as Parameters<ProviderStore['save']>[0]);
  });
  ipcMain.handle(CHANNELS.removeProvider, (_event, id: unknown) => providers().remove(id));
  ipcMain.handle(CHANNELS.activateProvider, (_event, id: unknown) => providers().activate(id));

  ipcMain.handle(CHANNELS.conversation, async () => (open ? transcript(await conversation(open)) : []));
  ipcMain.handle(CHANNELS.clearConversation, async () => {
    const state = requireOpen();
    if (working) throw new Error('The agent is working: stop it first.');
    state.messages = [];
    await saveConversation(state.project.path, []);
  });
  ipcMain.handle(CHANNELS.stopAgent, () => working?.abort());
  ipcMain.handle(CHANNELS.sendMessage, async (_event, text: unknown, rawMarks: unknown) => {
    const state = requireOpen();
    const marks = readMarks(rawMarks);
    if (typeof text !== 'string' || (!text.trim() && !marks.length)) throw new Error('Write a message first.');
    const engine = state.engine;
    if (!engine) throw new Error('Start a film in this folder first.');
    if (working) throw new Error('The agent is already working.');
    const provider = await providers().active();
    const controller = new AbortController();
    working = controller;
    const dir = state.project.path;
    const tools: ToolContext = {
      dir,
      build: async () => {
        if (open !== state || !state.watcher) throw new Error('The project was closed.');
        await state.watcher.rebuild();
        return state.build!;
      },
      stage: (version) => openStage(version),
      searchMotions: (words) => searchMotions(words),
      useMotion: (id) => takeMotion(state, id),
    };
    try {
      // A model that reads images sees each marked moment; any other reads the marks described.
      const content = await markedMessage(text.trim(), marks, provider.images !== false, async () => {
        const result = await tools.build();
        if (!result.ok) throw new Error('The film does not build, so its marked frames cannot be shown.');
        return openStage(result.version);
      });
      await runTurn(
        {
          messages: await conversation(state),
          content,
          call: caller(provider, engine.skill, TOOLS),
          tools,
          emit: (event: AgentEvent) => {
            if (open === state) send(EVENTS.agent, event);
          },
          save: (messages) => saveConversation(dir, messages),
          signal: controller.signal,
        },
        (error) => failure(error, provider.name),
      );
    } finally {
      working = null;
    }
  });

  ipcMain.handle(CHANNELS.exportFilm, async (event) => {
    const state = requireOpen();
    if (exporting) throw new Error('An export is already running.');
    const { build, engine } = state;
    if (!engine || !build?.ok) throw new Error('The film does not build: fix its errors before exporting.');
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
      await engine.exportFilm(state.project.path, build.version, result.filePath, (done) => send(EVENTS.exportProgress, done), controller.signal);
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
  servePreview(session.defaultSession, previewSource);
  serveRenders(previewSource);
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
