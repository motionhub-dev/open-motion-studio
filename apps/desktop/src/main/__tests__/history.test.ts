import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectHistory, changesBetween, noteFiles, putBack } from '../history';
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
it('restores a checkpoint older than a hand edit, and keeps the hand edit recoverable', async () => {
  await writeFile(join(dir, 'film.tsx'), 'original');
  await new ProjectHistory(dir, 'First').write('film.tsx', 'one');
  await writeFile(join(dir, 'film.tsx'), 'mine');
  const second = new ProjectHistory(dir, 'Second');
  await second.write('film.tsx', 'two');
  const [turn2, turn1] = await second.list();
  await second.restore(turn1!.id);
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('original');
  await second.restore((await second.list())[0]!.id); // undo the restoration
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('two');
  await second.restore(turn2!.id);
  expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('mine');
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

describe('an outside agent’s turn', () => {
  it('records the files that changed between two notes as one checkpoint that restores', async () => {
    await writeFile(join(dir, 'film.tsx'), 'one');
    await writeFile(join(dir, 'old.txt'), 'gone soon');
    await mkdir(join(dir, 'motions', '@hub', 'look'), { recursive: true });
    await writeFile(join(dir, 'motions', '@hub', 'look', 'MOTION.md'), 'hub');
    const before = await noteFiles(dir);
    expect([...before.keys()].sort()).toEqual(['film.tsx', 'old.txt']);
    await writeFile(join(dir, 'film.tsx'), 'two');
    await writeFile(join(dir, 'new.txt'), 'new');
    await rm(join(dir, 'old.txt'));
    const changes = changesBetween(before, await noteFiles(dir));
    expect(changes.map((c) => [c.path, c.before !== null, c.after !== null])).toEqual([
      ['film.tsx', true, true],
      ['new.txt', false, true],
      ['old.txt', true, false],
    ]);
    const history = new ProjectHistory(dir, 'Make it two');
    const id = await history.record(changes);
    expect(await history.record([])).toBeUndefined();
    await history.restore(id!);
    expect(await readFile(join(dir, 'film.tsx'), 'utf8')).toBe('one');
    expect(await readFile(join(dir, 'old.txt'), 'utf8')).toBe('gone soon');
    await expect(readFile(join(dir, 'new.txt'))).rejects.toThrow();
  });
});

it('notes the motions from motionhub on their own, and puts back what changed in them', async () => {
  await mkdir(join(dir, 'motions', '@hub', 'look'), { recursive: true });
  await mkdir(join(dir, 'motions', 'mine'), { recursive: true });
  await writeFile(join(dir, 'motions', '@hub', 'look', 'tokens.json'), '{"a":1}');
  await writeFile(join(dir, 'motions', 'mine', 'tokens.json'), 'own');
  await writeFile(join(dir, 'film.tsx'), 'film');
  const published = await noteFiles(dir, true);
  expect([...published.keys()]).toEqual(['motions/@hub/look/tokens.json']);
  await writeFile(join(dir, 'motions', '@hub', 'look', 'tokens.json'), '{"a":2}');
  await writeFile(join(dir, 'motions', '@hub', 'look', 'extra.css'), 'x');
  await putBack(dir, changesBetween(published, await noteFiles(dir, true)));
  expect(await readFile(join(dir, 'motions', '@hub', 'look', 'tokens.json'), 'utf8')).toBe('{"a":1}');
  await expect(readFile(join(dir, 'motions', '@hub', 'look', 'extra.css'))).rejects.toThrow();
  expect(await readFile(join(dir, 'motions', 'mine', 'tokens.json'), 'utf8')).toBe('own');
});

it('names an outside agent’s files in the project, whichever slash it wrote, and leaves other paths whole', async () => {
  const { inProject } = await import('../history');
  const dir = String.raw`C:\Users\me\films\heat`;
  expect(inProject(String.raw`Editing C:\Users\me\films\heat\parts\gauge.tsx`, dir)).toBe(String.raw`Editing parts\gauge.tsx`);
  expect(inProject('Reading C:/Users/me/films/heat/film.tsx', dir)).toBe('Reading film.tsx');
  expect(inProject(String.raw`Reading C:\Users\me\films\heat-old\film.tsx`, dir)).toBe(String.raw`Reading C:\Users\me\films\heat-old\film.tsx`);
  expect(inProject('Running ls /home/me/films/heat/parts', '/home/me/films/heat')).toBe('Running ls parts');
});
