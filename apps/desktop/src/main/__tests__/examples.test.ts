import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EXAMPLES, exampleSource, openExample } from '../examples';
import { watchFilm } from '../film/film';
vi.mock('electron', () => ({}));
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-examples-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
it('builds every starting point as a normal film', async () => {
  for (const example of EXAMPLES) {
    const project = await openExample(dir, example.id);
    let built!: (ok: boolean) => void;
    const result = new Promise<boolean>((resolve) => {
      built = resolve;
    });
    const context = await watchFilm(project.path, (r) => built(r.ok));
    try {
      expect(await result).toBe(true);
    } finally {
      await context.dispose();
    }
  }
});
it('copies a pristine template into a fresh folder on every click and preserves earlier edits', async () => {
  const first = await openExample(dir, 'kinetic');
  await writeFile(join(first.path, 'film.tsx'), 'mine');
  const second = await openExample(dir, 'kinetic');
  expect(second.path).not.toBe(first.path);
  expect(second.name).toBe(`${first.name} 2`);
  expect(await readFile(join(first.path, 'film.tsx'), 'utf8')).toBe('mine');
  expect(await readFile(join(second.path, 'film.tsx'), 'utf8')).toBe(exampleSource(EXAMPLES.find((e) => e.id === 'kinetic')!));
  await expect(openExample(dir, '../escape')).rejects.toThrow('starting points');
});
