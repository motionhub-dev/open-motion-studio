import { mkdtemp, readFile, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importAssets, projectAssets } from '../assets';
vi.mock('electron', () => ({}));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oms-assets-'));
  await mkdir(join(root, 'project'));
  await mkdir(join(root, 'source'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it('copies assets without overwriting existing names or changing originals', async () => {
  const source = join(root, 'source', 'logo.svg');
  await writeFile(source, 'one');
  const dir = join(root, 'project');
  await importAssets(dir, [source]);
  await writeFile(source, 'two');
  const assets = await importAssets(dir, [source]);
  expect(assets.map((a) => a.path)).toEqual(['media/logo-2.svg', 'media/logo.svg']);
  expect(await readFile(join(dir, 'media/logo.svg'), 'utf8')).toBe('one');
  expect(await readFile(source, 'utf8')).toBe('two');
});
it('does not follow a symlink out of the project', async () => {
  const dir = join(root, 'project');
  await symlink(join(root, 'source'), join(dir, 'media'));
  await expect(projectAssets(dir)).rejects.toThrow('symbolic link');
});
it('rejects unsupported files before importing any selection', async () => {
  const dir = join(root, 'project');
  const image = join(root, 'source', 'a.png');
  await writeFile(image, 'image');
  await expect(importAssets(dir, [image, join(root, 'source', 'bad.exe')])).rejects.toThrow('not a supported');
  expect(await projectAssets(dir)).toEqual([]);
});
