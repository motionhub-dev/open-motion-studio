import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { CHANNELS, EVENTS } from '../../shared/api';
import { createWorkspace } from '../workspace';
import { rememberProject, projectAt } from '../project';

const mocks = vi.hoisted(() => ({ root: '', delayAbort: false, turns: [] as any[], watchers: [] as any[] }));
vi.mock('electron', () => ({
  app: { getPath: () => mocks.root },
  safeStorage: { getSelectedStorageBackend: () => 'gnome_libsecret' },
  BrowserWindow: {},
  Notification: { isSupported: () => false },
}));
vi.mock('../film/film', async (original) => ({
  ...await original<typeof import('../film/film')>(),
  watchFilm: vi.fn(async (dir, onBuild) => {
    const watcher = { dir, dispose: vi.fn(), rebuild: vi.fn() };
    mocks.watchers.push(watcher);
    onBuild({ ok: true, version: 1, errors: [] });
    return watcher;
  }),
}));
vi.mock('../agent/loop', async (original) => ({
  ...await original<typeof import('../agent/loop')>(),
  runTurn: vi.fn(async (context) => new Promise((done) => {
    mocks.turns.push({ context, done });
    context.signal.addEventListener('abort', () => { if (!mocks.delayAbort) done({ ok: false }); }, { once: true });
  })),
}));

function windowStub() {
  return {
    webContents: { send: vi.fn() },
    isDestroyed: () => false, isFocused: () => true, isMinimized: () => false, isVisible: vi.fn(() => true),
    focus: vi.fn(), setTitle: vi.fn(),
  };
}
const workspaces: ReturnType<typeof createWorkspace>[] = [];
function workspace() {
  const window = windowStub();
  const state = createWorkspace(window as never, {} as never, vi.fn());
  workspaces.push(state);
  return { state, window };
}
const call = (state: ReturnType<typeof createWorkspace>, channel: string, ...args: unknown[]) =>
  state.handlers.get(channel)!({} as never, ...args);

let a: string;
let b: string;
beforeAll(async () => { mocks.root = await mkdtemp(join(tmpdir(), 'oms-windows-')); });
afterAll(async () => { await rm(mocks.root, { recursive: true, force: true }); });
beforeEach(async () => {
  const folder = await mkdtemp(join(mocks.root, 'case-'));
  mocks.turns.length = 0;
  mocks.delayAbort = false;
  mocks.watchers.length = 0;
  a = join(folder, 'a'); b = join(folder, 'b');
  for (const path of [a, b]) {
    await mkdir(path);
    await writeFile(join(path, 'film.tsx'), 'export default function Film() { return null; }');
    await rememberProject(join(mocks.root, 'projects.json'), projectAt(path));
  }
});
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((w) => w.close()));
});

it('keeps projects, build events and cleanup with the window that opened them', async () => {
  const first = workspace(); const second = workspace();
  await Promise.all([first.state.open(projectAt(a)), second.state.open(projectAt(b))]);
  expect(first.state.previewSource()).toBe(a);
  expect(second.state.previewSource()).toBe(b);
  expect(first.window.webContents.send).toHaveBeenCalledExactlyOnceWith(EVENTS.build, { ok: true, version: 1, errors: [] });
  expect(second.window.webContents.send).toHaveBeenCalledExactlyOnceWith(EVENTS.build, { ok: true, version: 1, errors: [] });
  await first.state.close();
  expect(mocks.watchers.find((w) => w.dir === a).dispose).toHaveBeenCalledOnce();
  expect(mocks.watchers.find((w) => w.dir === b).dispose).not.toHaveBeenCalled();
  expect(second.state.previewSource()).toBe(b);
});

it('focuses a project already open elsewhere, and releases it when that window closes', async () => {
  const first = workspace(); const second = workspace();
  await first.state.open(projectAt(a));
  await second.state.open(projectAt(b));
  await expect(second.state.open(projectAt(a))).rejects.toThrow('already open');
  expect(first.window.focus).toHaveBeenCalledOnce();
  expect(second.state.previewSource()).toBe(b);
  await first.state.close();
  await second.state.open(projectAt(a));
  expect(second.state.previewSource()).toBe(a);
});

it('runs two agent turns together and stops only the requesting window’s turn', async () => {
  const first = workspace(); const second = workspace();
  await Promise.all([first.state.open(projectAt(a)), second.state.open(projectAt(b))]);
  await call(first.state, CHANNELS.saveProvider, { name: 'Local', protocol: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'qa', images: false });
  first.window.webContents.send.mockClear(); second.window.webContents.send.mockClear();
  const one = call(first.state, CHANNELS.sendMessage, 'First film', [], [], 1);
  const two = call(second.state, CHANNELS.sendMessage, 'Second film', [], [], 1);
  await vi.waitFor(() => expect(mocks.turns).toHaveLength(2));
  const turnA = mocks.turns.find((t) => t.context.tools.dir === a);
  const turnB = mocks.turns.find((t) => t.context.tools.dir === b);
  turnA.context.emit({ type: 'text', text: 'Only A' });
  expect(first.window.webContents.send).toHaveBeenCalledWith(EVENTS.agent, { type: 'text', text: 'Only A' });
  expect(second.window.webContents.send).not.toHaveBeenCalled();
  call(first.state, CHANNELS.stopAgent);
  expect(turnA.context.signal.aborted).toBe(true);
  expect(turnB.context.signal.aborted).toBe(false);
  await expect(one).resolves.toEqual({ ok: false });
  turnB.done({ ok: true });
  await expect(two).resolves.toEqual({ ok: true });
});

it('waits for a stopped session’s turn to settle before releasing its project to another writer', async () => {
  const first = workspace(); const second = workspace();
  await first.state.open(projectAt(a));
  await call(first.state, CHANNELS.saveProvider, { name: 'Local', protocol: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'qa', images: false });
  mocks.delayAbort = true;
  const turn = call(first.state, CHANNELS.sendMessage, 'Finish my film', [], [], 1);
  await vi.waitFor(() => expect(mocks.turns).toHaveLength(1));
  const disposing = first.state.dispose();
  expect(mocks.turns[0].context.signal.aborted).toBe(true);
  await expect(second.state.open(projectAt(a))).rejects.toThrow('already open');
  mocks.turns[0].done({ ok: false });
  await turn;
  await disposing;
  await second.state.open(projectAt(a));
  expect(second.state.previewSource()).toBe(a);
});

it('keeps a hidden editor’s task running and reports progress without replacing it on a rejected second send', async () => {
  const editor = workspace();
  await editor.state.open(projectAt(a));
  await call(editor.state, CHANNELS.saveProvider, { name: 'Local', protocol: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'qa', images: false });
  const pending = call(editor.state, CHANNELS.sendMessage, 'Keep creating', [], [], 1);
  await vi.waitFor(() => expect(mocks.turns).toHaveLength(1));
  editor.window.isVisible.mockReturnValue(false);
  mocks.turns[0].context.emit({ type: 'phase', phase: 'editing' });
  expect(editor.state.task()).toMatchObject({ status: 'running', title: 'Keep creating', activity: 'Editing', background: true });
  expect(mocks.turns[0].context.signal.aborted).toBe(false);
  await expect(call(editor.state, CHANNELS.sendMessage, 'A duplicate', [], [], 1)).rejects.toThrow('current task');
  expect(editor.state.task()?.title).toBe('Keep creating');
  editor.window.isVisible.mockReturnValue(true);
  expect(editor.state.task()?.background).toBe(false);
  mocks.turns[0].done({ ok: true });
  await pending;
  expect(editor.state.task()).toMatchObject({ status: 'done', activity: 'Completed' });
});
