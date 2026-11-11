import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectHistory } from '../history';
vi.mock('electron', () => ({}));
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-history-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
it('restores multiple agent turns and can undo the restoration', async () => {
  await writeFile(join(dir, 'film.tsx'), 'original');
  const first = new ProjectHistory(dir, 'First');
  await first.write('film.tsx', 'one');
  await first.write('film.tsx', 'two');
  await new ProjectHistory(dir, 'Second').write('film.tsx', 'three');
  await first.restore((await first.list())[1]!.id);
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('original');
  await first.restore((await first.list())[0]!.id);
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('three');
});
it('preflights every file and never overwrites external edits or unrelated assets', async () => {
  const history = new ProjectHistory(dir, 'Title');
  await history.write('film.tsx', 'agent');
  await history.write('part.tsx', 'part');
  await writeFile(join(dir, 'part.tsx'), 'outside');
  await writeFile(join(dir, 'asset.png'), 'mine');
  await expect(history.restore((await history.list())[0]!.id)).rejects.toThrow('outside');
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('agent');
  expect(await readFile(join(dir, 'asset.png'), 'utf8')).toBe('mine');
});
it('removes only newly created agent files and preserves their contents for undo', async () => {
  const history = new ProjectHistory(dir, 'New part');
  await history.write('parts/title.tsx', 'title');
  await history.restore((await history.list())[0]!.id);
  await expect(readFile(join(dir, 'parts/title.tsx'))).rejects.toMatchObject({ code: 'ENOENT' });
  await history.restore((await history.list())[0]!.id);
  expect(await readFile(join(dir, 'parts/title.tsx'), 'utf8')).toBe('title');
});
it('refuses symbolic links and protected paths', async () => {
  const history = new ProjectHistory(dir, 'Bad');
  await symlink(join(dir, 'target'), join(dir, 'link'));
  await expect(history.write('link', 'bad')).rejects.toThrow('symbolic link');
  await expect(history.write('../escape', 'bad')).rejects.toThrow();
  await expect(history.write('.motion-studio/session.json', 'bad')).rejects.toThrow();
});
it('detects external edits between writes in a turn', async () => {
  const history = new ProjectHistory(dir, 'Edit');
  await history.write('film.tsx', 'one');
  await writeFile(join(dir, 'film.tsx'), 'external');
  await expect(history.write('film.tsx', 'two')).rejects.toThrow('outside');
});

it('refuses a stale exact edit without recording or overwriting the external version', async () => {
  const history = new ProjectHistory(dir, 'Edit');
  await writeFile(join(dir, 'film.tsx'), 'external version');
  await expect(history.write('film.tsx', 'agent edit', 'old version')).rejects.toThrow('changed while');
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('external version');
  expect(await history.list()).toEqual([]);
});
