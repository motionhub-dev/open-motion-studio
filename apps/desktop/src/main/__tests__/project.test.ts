import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The home folder the module sees: by default one the temporary folders are not in (on many machines the real one
// holds them, and a project there is shown with ~), and the test's own folder where ~ is what is tested.
const home = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (original) => ({ ...(await original<typeof import('node:os')>()), homedir: () => home.dir }));
import {
  MAX_RECENTS,
  createProject,
  createInWorkspace,
  ignore,
  isRecent,
  openProject,
  projectAt,
  recentProjects,
  rememberProject,
} from '../project';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oms-project-'));
  home.dir = resolve('/oms-no-such-home');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('openProject', () => {
  it('shows a folder under the home folder with ~, and others as they are', async () => {
    home.dir = root;
    const inside = join(root, 'films', 'one');
    await mkdir(inside, { recursive: true });
    expect((await openProject(inside)).display).toBe(join('~', 'films', 'one'));
    expect((await openProject(root)).display).toBe('~');
    home.dir = join(root, 'films', 'on');
    expect((await openProject(inside)).display).toBe(inside);
  });

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
    expect(project).toEqual({ name: 'film', path: dir, display: dir, film: false });
    expect((await stat(join(dir, '.motion-studio'))).isDirectory()).toBe(true);
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('.motion-studio/\n');
  });

  it('knows a folder holds a film by its film.tsx', async () => {
    const dir = join(root, 'with-film');
    await createProject(dir);
    expect(projectAt(dir).film).toBe(false);
    await writeFile(join(dir, 'film.tsx'), 'export default function Film() { return null; }');
    expect(projectAt(dir).film).toBe(true);
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

describe('createInWorkspace', () => {
  it('creates a workspace and an initialized project without reusing an existing folder or file', async () => {
    const workspace = join(root, 'Workspace');
    const first = await createInWorkspace(workspace);
    await writeFile(join(first.path, 'film.tsx'), 'keep my film');
    await writeFile(join(workspace, 'Untitled film 2'), 'keep my file');
    const next = await createInWorkspace(workspace);
    expect(next.path).toBe(join(workspace, 'Untitled film 3'));
    expect((await stat(join(next.path, '.motion-studio'))).isDirectory()).toBe(true);
    expect(await readFile(join(first.path, 'film.tsx'), 'utf8')).toBe('keep my film');
    expect(await readFile(join(workspace, 'Untitled film 2'), 'utf8')).toBe('keep my file');
  });

  it('reserves different folders for simultaneous creations', async () => {
    const projects = await Promise.all(Array.from({ length: 4 }, () => createInWorkspace(root, 'A film')));
    expect(new Set(projects.map((p) => p.path)).size).toBe(4);
    expect(projects.map((p) => p.name).sort()).toEqual(['A film', 'A film 2', 'A film 3', 'A film 4']);
  });

  it('rejects names that escape the workspace and a workspace that is a file', async () => {
    for (const name of ['', '.', '..', '../outside', 'a/b', 'a\\b']) {
      await expect(createInWorkspace(root, name)).rejects.toThrow('single folder name');
    }
    const file = join(root, 'file');
    await writeFile(file, 'keep');
    await expect(createInWorkspace(file)).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('keep');
  });
});

describe('ignore', () => {
  it('appends to an existing .gitignore on a line of its own', async () => {
    await writeFile(join(root, '.gitignore'), 'node_modules');
    await ignore(root, ['.motion-studio/']);
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n.motion-studio/\n');
  });

  it('adds only the entries a .gitignore lacks', async () => {
    await writeFile(join(root, '.gitignore'), '/node_modules\n');
    await ignore(root, ['node_modules/', 'out/']);
    expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe('/node_modules\nout/\n');
  });

  it('leaves a .gitignore that already ignores the state directory', async () => {
    for (const line of ['.motion-studio', '/.motion-studio/']) {
      await writeFile(join(root, '.gitignore'), `dist\r\n${line}\r\n`);
      await ignore(root, ['.motion-studio/']);
      expect(await readFile(join(root, '.gitignore'), 'utf8')).toBe(`dist\r\n${line}\r\n`);
    }
  });
});

describe('the recent list', () => {
  const file = () => join(root, 'recent-projects.json');

  async function folder(name: string) {
    const path = join(root, name);
    await mkdir(path);
    return { name, path, display: path, film: false };
  }

  it('keeps projects opened by several windows at the same time', async () => {
    const projects = await Promise.all(['one', 'two', 'three'].map(folder));
    await Promise.all(projects.map((project) => rememberProject(file(), project)));
    expect((await recentProjects(file())).map((p) => p.name).sort()).toEqual(['one', 'three', 'two']);
  });

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
