import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectFileToOpen, projectFiles, readProjectFile } from '../files';

vi.mock('electron', () => ({}));

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-files-'));
  await mkdir(join(dir, 'parts'));
  await mkdir(join(dir, 'media'));
  await mkdir(join(dir, '.motion-studio'));
  await mkdir(join(dir, 'node_modules', 'react'), { recursive: true });
  await writeFile(join(dir, 'film.tsx'), 'export default 1;');
  await writeFile(join(dir, 'parts', 'title.tsx'), 'export const Title = 1;');
  await writeFile(join(dir, 'media', 'logo.png'), 'png');
  await writeFile(join(dir, '.motion-studio', 'session.json'), '{}');
  await writeFile(join(dir, 'node_modules', 'react', 'index.js'), '');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it('lists the project’s files, code as text and media as not, without dot folders or node_modules', async () => {
  expect(await projectFiles(dir)).toEqual([
    { path: 'film.tsx', bytes: 17, text: true },
    { path: 'media/logo.png', bytes: 3, text: false },
    { path: 'parts/title.tsx', bytes: 23, text: true },
  ]);
});

it('reads a text file of the project, and nothing outside it, in a dot folder or that is not text', async () => {
  expect(await readProjectFile(dir, 'parts/title.tsx')).toBe('export const Title = 1;');
  await expect(readProjectFile(dir, '../outside.tsx')).rejects.toThrow('outside the project');
  await expect(readProjectFile(dir, '.motion-studio/session.json')).rejects.toThrow('not one of the project');
  await expect(readProjectFile(dir, 'node_modules/react/index.js')).rejects.toThrow('not one of the project');
  await expect(readProjectFile(dir, 'media/logo.png')).rejects.toThrow('not a text file');
  await expect(readProjectFile(dir, 'parts')).rejects.toThrow('not a file');
  await writeFile(join(dir, 'big.json'), 'x'.repeat(1024 * 1024 + 1));
  await expect(readProjectFile(dir, 'big.json')).rejects.toThrow('larger than 1 MB');
  expect(await projectFileToOpen(dir, 'media/logo.png')).toBe(join(dir, 'media', 'logo.png'));
});

it('never reads through a symbolic link', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'oms-outside-'));
  await writeFile(join(outside, 'secret.ts'), 'secret');
  try {
    await symlink(outside, join(dir, 'linked'), 'junction');
  } catch {
    return; // this system will not make a link here
  }
  await expect(readProjectFile(dir, 'linked/secret.ts')).rejects.toThrow('symbolic link');
  expect((await projectFiles(dir)).some((f) => f.path.startsWith('linked'))).toBe(false);
  await rm(outside, { recursive: true, force: true });
});
