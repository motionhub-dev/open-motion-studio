import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { CHANNELS } from '../../shared/api';
import { createWorkspace } from '../workspace';
import { projectAt } from '../project';

// An outside agent's turn (ADR 0008) with the agent itself replaced: what it does to the project's motions is scripted
// here, through the Studio's tools as the real one reaches them.
const mocks = vi.hoisted(() => ({
  root: '',
  tools: null as null | { useMotion(id: string): Promise<{ id: string; path: string }> },
  turn: async (_dir: string) => {},
}));
vi.mock('electron', () => ({
  app: { getPath: () => mocks.root, getVersion: () => '0.0.0' },
  safeStorage: { getSelectedStorageBackend: () => 'gnome_libsecret' },
  BrowserWindow: {},
  Notification: { isSupported: () => false },
}));
vi.mock('../film/film', async (original) => ({
  ...(await original<typeof import('../film/film')>()),
  watchFilm: vi.fn(async (dir, onBuild) => {
    onBuild({ ok: true, version: 1, errors: [] });
    return { dir, dispose: vi.fn(), rebuild: vi.fn() };
  }),
}));
vi.mock('../agent/harness', async (original) => ({
  ...(await original<typeof import('../agent/harness')>()),
  findCodex: vi.fn(async () => ({ state: 'found', bin: 'codex' })),
}));
vi.mock('../agent/studio-mcp', () => ({
  startStudioMcp: vi.fn(async (tools) => {
    mocks.tools = tools;
    return { url: 'http://127.0.0.1:1/mcp', close: vi.fn() };
  }),
}));
vi.mock('../agent/codex', async (original) => ({
  ...(await original<typeof import('../agent/codex')>()),
  startCodex: vi.fn(async () => ({ request: vi.fn(async () => ({ config: {} })), close: vi.fn() })),
  openThread: vi.fn(async () => 'thread'),
  codexModels: vi.fn(async () => []),
  codexChoice: vi.fn(() => ({})),
  codexTurn: vi.fn(async (_codex, _thread, _input, _choice, _emit, _signal, _ask, place: (path: string) => string) => {
    await mocks.turn(place('.'));
    return { ok: true, spent: { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }, calls: 1 } };
  }),
}));
// Taking a motion writes it as @motionhub/cli does, without the network.
vi.mock('../motions', async (original) => ({
  ...(await original<typeof import('../motions')>()),
  useMotion: vi.fn(async (dir: string, id: string) => {
    const folder = join(dir, 'motions', ...id.split('/'));
    await mkdir(join(folder, 'react', 'parts'), { recursive: true });
    await writeFile(join(folder, 'react', 'parts', 'ring.tsx'), 'export const Ring = () => null;');
    await writeFile(join(folder, 'MOTION.md'), '# Taken');
    return { id, path: join('motions', ...id.split('/')), name: id, line: '' };
  }),
}));

let project: string;
const workspaces: ReturnType<typeof createWorkspace>[] = [];
beforeAll(async () => {
  mocks.root = await mkdtemp(join(tmpdir(), 'oms-outside-'));
  project = join(mocks.root, 'film');
  await mkdir(join(project, '.motion-studio'), { recursive: true });
  await writeFile(join(project, 'film.tsx'), 'export default function Film() { return null; }');
  await writeFile(join(project, '.motion-studio', 'agent.json'), JSON.stringify({ kind: 'codex', items: [] }));
  await mkdir(join(project, 'motions', '@hub', 'kept'), { recursive: true });
  await writeFile(join(project, 'motions', '@hub', 'kept', 'MOTION.md'), 'as published');
});
afterAll(async () => {
  await rm(mocks.root, { recursive: true, force: true });
});
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((w) => w.close()));
});

it('keeps a motion the Studio takes during the turn, and puts back what the agent changed in one', async () => {
  const window = { webContents: { send: vi.fn() }, isDestroyed: () => false, isFocused: () => true, isMinimized: () => false, isVisible: () => true, focus: vi.fn(), setTitle: vi.fn() };
  const state = createWorkspace(window as never, {} as never, vi.fn());
  workspaces.push(state);
  await state.open(projectAt(project));
  mocks.turn = async () => {
    await writeFile(join(project, 'motions', '@hub', 'kept', 'MOTION.md'), 'edited by the agent');
    await mocks.tools!.useMotion('@scope/screen-desk');
    await writeFile(join(project, 'parts.tsx'), "import { Ring } from './motions/@scope/screen-desk/react/parts/ring.tsx';");
  };
  expect(await state.handlers.get(CHANNELS.sendMessage)!({} as never, 'Use the screen desk', [], [], 1)).toEqual({ ok: true });
  expect(await readFile(join(project, 'motions', '@scope', 'screen-desk', 'react', 'parts', 'ring.tsx'), 'utf8')).toBe('export const Ring = () => null;');
  expect(await readFile(join(project, 'motions', '@scope', 'screen-desk', 'MOTION.md'), 'utf8')).toBe('# Taken');
  expect(await readFile(join(project, 'motions', '@hub', 'kept', 'MOTION.md'), 'utf8')).toBe('as published');
});
