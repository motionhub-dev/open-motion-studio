import { mkdtemp, readFile, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importAssets, projectAssets, renameAsset, trashAsset } from '../assets';
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
  await expect(importAssets(dir, [image, join(root, 'source', 'bad.exe')])).rejects.toThrow('the Studio takes');
  expect(await projectAssets(dir)).toEqual([]);
});
it('takes music and sound effects beside images and fonts', async () => {
  const dir = join(root, 'project');
  const files = ['bed.mp3', 'hit.WAV', 'voice.m4a', 'loop.ogg'].map((name) => join(root, 'source', name));
  for (const file of files) await writeFile(file, 'sound');
  const assets = await importAssets(dir, files);
  expect(assets.map((a) => [a.path, a.kind])).toEqual([
    ['media/bed.mp3', 'audio'],
    ['media/hit.WAV', 'audio'],
    ['media/loop.ogg', 'audio'],
    ['media/voice.m4a', 'audio'],
  ]);
});
it('says a file is used when the film’s own code names its path', async () => {
  const dir = join(root, 'project');
  const files = ['logo.png', 'bed.mp3'].map((name) => join(root, 'source', name));
  for (const file of files) await writeFile(file, 'bytes');
  await importAssets(dir, files);
  await writeFile(join(dir, 'film.tsx'), `const logo = 'media/logo.png';`);
  expect((await projectAssets(dir)).map((a) => [a.name, a.used])).toEqual([
    ['bed.mp3', false],
    ['logo.png', true],
  ]);
});
it('renames a file the video does not use, keeping its extension, and refuses the rest', async () => {
  const dir = join(root, 'project');
  const files = ['logo.png', 'used.png', 'other.png'].map((name) => join(root, 'source', name));
  for (const file of files) await writeFile(file, 'bytes');
  await importAssets(dir, files);
  await writeFile(join(dir, 'film.tsx'), `const used = 'media/used.png';`);
  expect((await renameAsset(dir, 'media/logo.png', 'brand')).map((a) => a.name)).toEqual(['brand.png', 'other.png', 'used.png']);
  expect(await readFile(join(dir, 'media', 'brand.png'), 'utf8')).toBe('bytes');
  await expect(renameAsset(dir, 'media/brand.png', 'brand.jpg')).rejects.toThrow('Keep the .png');
  await expect(renameAsset(dir, 'media/brand.png', 'other.png')).rejects.toThrow('already a file');
  await expect(renameAsset(dir, 'media/brand.png', '../escape.png')).rejects.toThrow('single folder name');
  await expect(renameAsset(dir, 'media/used.png', 'x')).rejects.toThrow('The video uses used.png');
  await expect(renameAsset(dir, 'film.tsx', 'x')).rejects.toThrow('not among');
});
it('moves a file the video does not use to the trash, never one it uses', async () => {
  const dir = join(root, 'project');
  const files = ['logo.png', 'used.png'].map((name) => join(root, 'source', name));
  for (const file of files) await writeFile(file, 'bytes');
  await importAssets(dir, files);
  await writeFile(join(dir, 'film.tsx'), `const used = 'media/used.png';`);
  const trashed: string[] = [];
  const trash = async (file: string) => {
    trashed.push(file);
    await rm(file);
  };
  expect((await trashAsset(dir, 'media/logo.png', trash)).map((a) => a.name)).toEqual(['used.png']);
  expect(trashed).toEqual([join(dir, 'media', 'logo.png')]);
  await expect(trashAsset(dir, 'media/used.png', trash)).rejects.toThrow('The video uses');
  await expect(trashAsset(dir, '../outside.png', trash)).rejects.toThrow('not among');
  expect(trashed).toHaveLength(1);
});
