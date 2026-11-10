import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_RECENTS,
  createProject,
  ignoreStateDir,
  isRecent,
  openProject,
  recentProjects,
  rememberProject,
} from '../project';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oms-project-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('openProject', () => {
  it('opens a folder without writing to it', async () => {
    await writeFile(join(root, 'index.html'), '');
    const project = await openProject(root);
    expect(project.path).toBe(root);
    await expect(stat(join(root, '.motion-studio'))).rejects.toThrow();
    await expect(stat(join(root, '.gitignore'))).rejects.toThrow();
  });

  it('refuses a path that is not a folder', async () => {
    await writeFile(join(root, 'file.txt'), '');
    await expect(openProject(join(root, 'file.txt'))).rejects.toThrow('Not a folder');
    await expect(openProject(join(root, 'missing'))).rejects.toThrow('Not a folder');
  });
});

describe('createProject', () => {
  it('makes a new folder a project, with its state ignored by git', async () => {
    const dir = join(root, 'new', 'film');
    const project = await createProject(dir);
    expect(project).toEqual({ name: 'film', path: dir, engine: null });
    expect((await stat(join(dir, '.motion-studio'))).isDirectory()).toBe(true);
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('.motion-studio/\n');
  });

  it('accepts an empty folder, ignoring what an OS leaves in one', async () => {
    await writeFile(join(root, '.DS_Store'), '');
    await expect(createProject(root)).resolves.toMatchObject({ path: root });
  });

  it('refuses a folder that holds anything else, and writes nothing to it', async () => {
    await writeFile(join(root, 'notes.md'), '');
    await expect(createProject(root)).rejects.toThrow('not empty');
    await expect(stat(join(root, '.motion-studio'))).rejects.toThrow();
  });
});

describe('ignoreStateDir', () => {
  it('appends to an existing .gitignore on a line of its own', async () => {
    await writeFile(join(root, '.gitignore'), 'node_modules');
    await ignoreStateDir(root);
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n.motion-studio/\n');
  });

  it('leaves a .gitignore that already ignores the state directory', async () => {
    for (const line of ['.motion-studio', '/.motion-studio/']) {
      await writeFile(join(root, '.gitignore'), `dist\r\n${line}\r\n`);
      await ignoreStateDir(root);
      expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe(`dist\r\n${line}\r\n`);
    }
  });
});

describe('the recent list', () => {
  const file = () => join(root, 'recent-projects.json');

  async function folder(name: string) {
    const path = join(root, name);
    await mkdir(path);
    return { name, path, engine: null };
  }

  it('is empty when nothing was stored or the file is corrupt', async () => {
    expect(await recentProjects(file())).toEqual([]);
    await writeFile(file(), '{not json');
    expect(await recentProjects(file())).toEqual([]);
  });

  it('keeps the most recent first, once each, at most MAX_RECENTS', async () => {
    const projects = [];
    for (let i = 0; i <= MAX_RECENTS; i++) projects.push(await folder(`p${i}`));
    for (const project of projects) await rememberProject(file(), project);
    await rememberProject(file(), projects[5]!);
    const recents = await recentProjects(file());
    expect(recents).toHaveLength(MAX_RECENTS);
    expect(recents[0]).toEqual(projects[5]);
    expect(recents[1]).toEqual(projects[MAX_RECENTS]);
    expect(recents.map((p) => p.path)).not.toContain(projects[0]!.path);
  });

  it('leaves out folders that no longer exist', async () => {
    const kept = await folder('kept');
    const gone = await folder('gone');
    await rememberProject(file(), kept);
    await rememberProject(file(), gone);
    await rm(gone.path, { recursive: true });
    expect(await recentProjects(file())).toEqual([kept]);
  });

  it('answers only for paths on it', async () => {
    const kept = await folder('kept');
    await rememberProject(file(), kept);
    expect(await isRecent(file(), kept.path)).toBe(true);
    expect(await isRecent(file(), join(root, 'elsewhere'))).toBe(false);
  });
});
