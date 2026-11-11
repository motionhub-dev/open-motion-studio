import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { safePreviewFile, within } from '../preview';

vi.mock('electron', () => ({ app: {}, protocol: {} }));

describe('within', () => {
  const root = join('/projects', 'film', '.motion-studio', 'build');

  it('maps a URL path to a file under the root', () => {
    expect(within(root, 'film.js')).toBe(join(root, 'film.js'));
    expect(within(root, 'img/logo%20big.png')).toBe(join(root, 'img', 'logo big.png'));
  });

  it('refuses a path that would leave the root, however it is spelled', () => {
    for (const path of ['../film.tsx', '%2e%2e/film.tsx', 'a/../../x', '..%2F..%2Fsecret', '..\\x', '']) {
      expect(within(root, path)).toBeNull();
    }
  });
});

it('keeps checkpoint state and external symlinks out of film code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oms-preview-'));
  try {
    const project = join(root, 'project');
    await mkdir(join(project, '.motion-studio'), { recursive: true });
    await writeFile(join(project, '.motion-studio', 'history.json'), 'private');
    await writeFile(join(root, 'outside.txt'), 'outside');
    await symlink(join(root, 'outside.txt'), join(project, 'outside'));
    await symlink(join(project, '.motion-studio', 'history.json'), join(project, 'inside'));
    expect(await safePreviewFile(project, '.motion-studio/history.json', true)).toBeNull();
    expect(await safePreviewFile(project, 'inside', true)).toBeNull();
    expect(await safePreviewFile(project, 'outside', true)).toBeNull();
    await writeFile(join(project, 'logo.svg'), 'image');
    expect(await safePreviewFile(project, 'logo.svg', true)).toBe(join(project, 'logo.svg'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
