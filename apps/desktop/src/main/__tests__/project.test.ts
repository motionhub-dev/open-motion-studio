import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The home folder the module sees: by default one the temporary folders are not in (on many machines the real one
// holds them, and a project there is shown with ~), and the test's own folder where ~ is what is tested.
const home = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (original) => ({ ...(await original<typeof import('node:os')>()), homedir: () => home.dir }));
import {
  COVER,
  STATE_DIR,
  createProject,
  createInWorkspace,
  duplicateProject,
  folderName,
  renameProject,
  filmName,
  forgetProject,
  ignore,
  inLibrary,
  openProject,
  projectAt,
  projectLibrary,
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

describe('filmName', () => {
  it('names a film from the first line of its brief, as a folder can be named', () => {
    expect(filmName('  A launch teaser: our app / v2?\nwith details')).toBe('A launch teaser our app v2');
    expect(filmName('为新的阅读应用制作一段 15 秒的发布短片')).toBe('为新的阅读应用制作一段 15 秒的发布短片');
  });
  it('keeps at most 40 characters, at a word end where there is one', () => {
    const name = filmName('A thirty second explainer on how solar panels turn light into power');
    expect([...name].length).toBeLessThanOrEqual(40);
    expect(name).toBe('A thirty second explainer on how solar');
    expect(filmName('Reading app launch teaser: calm, warm, 15 seconds')).toBe('Reading app launch teaser calm, warm');
    expect(filmName('为阅读应用做一段发布短片。')).toBe('为阅读应用做一段发布短片');
  });
  it('falls back to Untitled film for nothing usable or a reserved name', () => {
    for (const brief of ['   ', '???', 'CON', 'nul.', '...']) expect(filmName(brief)).toBe('Untitled film');
  });
  it('gives a name createInWorkspace accepts', async () => {
    const project = await createInWorkspace(root, filmName('Kinetic type: “Make it move”'));
    expect(project.name).toBe('Kinetic type “Make it move”');
  });
});

describe('folderName', () => {
  it('keeps a name every system can hold, trimmed', () => {
    expect(folderName('  Launch teaser  ')).toBe('Launch teaser');
    expect(folderName('产品介绍 · 第二版')).toBe('产品介绍 · 第二版');
  });
  it('refuses a separator, a character Windows refuses, a device name or a trailing dot', () => {
    for (const name of ['', '  ', '.', '..', 'a/b', 'a\\b', 'a:b', 'what?', 'CON', 'nul', 'name.', 42])
      expect(() => folderName(name), String(name)).toThrow('single folder name');
  });
});

describe('renameProject', () => {
  it('renames the folder in place and keeps every file', async () => {
    const project = await createInWorkspace(root, 'Film');
    await writeFile(join(project.path, 'film.tsx'), 'the film');
    const renamed = await renameProject(project.path, 'Launch teaser');
    expect(renamed.path).toBe(join(root, 'Launch teaser'));
    expect(await readFile(join(renamed.path, 'film.tsx'), 'utf8')).toBe('the film');
    await expect(stat(project.path)).rejects.toThrow();
  });
  it('refuses a name another folder beside it has, and changes nothing', async () => {
    const one = await createInWorkspace(root, 'One');
    await createInWorkspace(root, 'Two');
    await expect(renameProject(one.path, 'Two')).rejects.toThrow('already a folder named Two');
    expect((await stat(one.path)).isDirectory()).toBe(true);
  });
  it('takes the same name as nothing to do', async () => {
    const one = await createInWorkspace(root, 'One');
    expect((await renameProject(one.path, ' One ')).path).toBe(one.path);
  });
});

describe('duplicateProject', () => {
  it('copies every file beside it as a new project, none of the Studio state', async () => {
    const project = await createInWorkspace(root, 'Film');
    await writeFile(join(project.path, 'film.tsx'), 'the film');
    await mkdir(join(project.path, 'media'));
    await writeFile(join(project.path, 'media', 'a.png'), 'png');
    await writeFile(join(project.path, '.motion-studio', 'agent.json'), '{"thread":"mine"}');
    await writeFile(join(project.path, '.gitignore'), 'node_modules/\n');
    const copy = await duplicateProject(project.path);
    expect(copy.name).toBe('Film copy');
    expect(await readFile(join(copy.path, 'film.tsx'), 'utf8')).toBe('the film');
    expect(await readFile(join(copy.path, 'media', 'a.png'), 'utf8')).toBe('png');
    await expect(stat(join(copy.path, '.motion-studio', 'agent.json'))).rejects.toThrow();
    expect(await readFile(join(copy.path, '.gitignore'), 'utf8')).toContain('.motion-studio/');
    expect((await duplicateProject(project.path)).name).toBe('Film copy 2');
    expect(await readFile(join(project.path, '.motion-studio', 'agent.json'), 'utf8')).toContain('mine');
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

describe('the project library', () => {
  const file = () => join(root, 'projects.json');

  async function folder(name: string) {
    const path = join(root, name);
    await mkdir(path);
    return { name, path, display: path, film: false };
  }

  it('keeps projects opened by several windows at the same time', async () => {
    const projects = await Promise.all(['one', 'two', 'three'].map(folder));
    await Promise.all(projects.map((project) => rememberProject(file(), project)));
    expect((await projectLibrary(file())).map((p) => p.name).sort()).toEqual(['one', 'three', 'two']);
  });

  it('is empty when nothing was stored or the file is corrupt', async () => {
    expect(await projectLibrary(file())).toEqual([]);
    await writeFile(file(), '{not json');
    expect(await projectLibrary(file())).toEqual([]);
  });

  it('keeps every project, the most recently opened first, once each', async () => {
    const projects = [];
    for (let i = 0; i < 12; i++) projects.push(await folder(`p${i}`));
    for (const project of projects) await rememberProject(file(), project);
    await rememberProject(file(), projects[5]!);
    const library = await projectLibrary(file());
    expect(library).toHaveLength(12);
    expect(library[0]).toMatchObject({ ...projects[5], missing: false });
    expect(library[1]?.path).toBe(projects[11]!.path);
    expect(library[0]!.lastOpened).toBeGreaterThanOrEqual(library[1]!.lastOpened);
  });

  it('keeps a folder that is gone, marked missing, so it can be located again', async () => {
    const gone = await folder('gone');
    await rememberProject(file(), gone);
    await rm(gone.path, { recursive: true });
    expect(await projectLibrary(file())).toMatchObject([{ path: gone.path, missing: true, film: false }]);
    expect(await inLibrary(file(), gone.path)).toBe(true);
  });

  it('answers only for paths in it, and forgetting one never touches its folder', async () => {
    const kept = await folder('kept');
    await rememberProject(file(), kept);
    expect(await inLibrary(file(), kept.path)).toBe(true);
    expect(await inLibrary(file(), join(root, 'elsewhere'))).toBe(false);
    await forgetProject(file(), kept.path);
    expect(await inLibrary(file(), kept.path)).toBe(false);
    expect((await stat(kept.path)).isDirectory()).toBe(true);
  });

  it('reads a cover from the project, never from the library file', async () => {
    const project = await createInWorkspace(root, 'Film');
    await rememberProject(file(), project);
    expect((await projectLibrary(file()))[0]?.cover).toBeUndefined();
    await writeFile(join(project.path, STATE_DIR, COVER), Buffer.from('AAAA', 'base64'));
    expect((await projectLibrary(file()))[0]?.cover).toBe('data:image/jpeg;base64,AAAA');
    expect(await readFile(file(), 'utf8')).not.toContain('base64');
  });
});
