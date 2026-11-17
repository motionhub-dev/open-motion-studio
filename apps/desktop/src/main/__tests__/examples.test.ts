import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EXAMPLES, TEMPLATE_FONT, exampleSource, openExample } from '../examples';
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

it('has each template rendered from its current source, for Home to play', async () => {
  const folder = fileURLToPath(new URL('../../renderer/src/templates/', import.meta.url));
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as Record<string, { seconds: number; film: string }>;
  expect(Object.keys(manifest).sort()).toEqual(EXAMPLES.map((example) => example.id).sort());
  for (const example of EXAMPLES) {
    const hash = createHash('sha256').update(exampleSource(example)).digest('hex');
    // Changed a template? Run `pnpm templates` to render it again.
    expect(manifest[example.id], example.id).toEqual({ seconds: example.seconds, film: hash });
    for (const kind of ['mp4', 'jpg']) expect((await stat(join(folder, `${example.id}.${kind}`))).size).toBeGreaterThan(0);
  }
});

it('gives each template copy its face and the face its licence, beside the film that imports it', async () => {
  const project = await openExample(dir, 'kinetic');
  for (const file of Object.values(TEMPLATE_FONT)) expect((await stat(join(project.path, 'media', file))).size).toBeGreaterThan(0);
  expect(await readFile(join(project.path, 'film.tsx'), 'utf8')).toContain(`import inter from './media/${TEMPLATE_FONT.face}'`);
});
