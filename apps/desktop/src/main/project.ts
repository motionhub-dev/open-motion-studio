// Projects on disk: a project is a folder, and the folder is the truth. The Studio
// writes only `.motion-studio/` inside it (its own state, ignored by git) and the
// project library in the app's userData. See docs/tech/architecture.md
// ("Components").

import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID, randomInt } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { LibraryProject, Project } from '../shared/api';
import { hasFilm } from './film/film';

export const STATE_DIR = '.motion-studio';

/** Files a new folder may already hold and still count as empty. */
const IGNORABLE = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function projectAt(path: string): Project {
  const absolute = resolve(path);
  const home = homedir();
  const display = absolute === home || absolute.startsWith(home + sep) ? `~${absolute.slice(home.length)}` : absolute;
  return { name: basename(absolute), path: absolute, display, film: hasFilm(absolute) };
}

/** Opens an existing folder as a project. Nothing is written to it. */
export async function openProject(path: string): Promise<Project> {
  if (!(await isDirectory(path))) throw new Error(`Not a folder: ${path}`);
  return projectAt(path);
}

/** Refuses a folder that holds anything but what an OS leaves in one; a folder that does not exist yet is empty. */
export async function requireEmpty(path: string): Promise<void> {
  if (!(await isDirectory(path))) return;
  const entries = (await readdir(path)).filter((entry) => !IGNORABLE.has(entry));
  if (entries.length > 0) throw new Error(`The folder is not empty: ${path}`);
}

/**
 * Makes a new project in a folder that does not exist yet or is empty: creates the
 * folder, the Studio's state directory, and a .gitignore that leaves that directory out.
 */
export async function createProject(path: string): Promise<Project> {
  await requireEmpty(path);
  await mkdir(join(path, STATE_DIR), { recursive: true });
  await ignore(path, [`${STATE_DIR}/`]);
  return projectAt(path);
}

/** Names Windows reserves for devices, which no folder may take. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * A folder name for a film from what the person said they want to make: its first line, without the characters a
 * folder name cannot hold, at most 40 characters at a word's end where there is one. None when nothing is left, and the
 * film is named as one made without a brief.
 */
export function filmName(brief: string): string | undefined {
  const line = brief.trim().split(/\r?\n/)[0] ?? '';
  const clean = line.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...clean];
  let name = chars.slice(0, 40).join('');
  if (chars.length > 40) {
    const space = name.lastIndexOf(' ');
    if (space >= 20) name = name.slice(0, space);
  }
  // No trailing dot or space (Windows drops them) and no punctuation left hanging where the words were cut.
  name = name.replace(/[\s.,;:!?，。、；：！？]+$/u, '');
  return name && !RESERVED.test(name) ? name : undefined;
}

/** A film made without a name: a fixed prefix and six random letters and digits, with no space for a shell or a URL. */
export function newFilmName(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyz23456789';
  return `film-${Array.from({ length: 6 }, () => letters[randomInt(letters.length)]).join('')}`;
}

/**
 * A project's folder name as the person typed it, trimmed, or an error: one folder name that every system can hold, so
 * no separator, no character Windows refuses, no device name, and no dot or space at its end.
 */
export function folderName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[/\\:*?"<>|\x00-\x1f]/.test(trimmed) || /[. ]$/.test(trimmed) || RESERVED.test(trimmed))
    throw new Error('A project name must be a single folder name.');
  return trimmed;
}

/**
 * Reserves a fresh child directory atomically; existing files, directories and symlinks are never reused. A name given
 * is numbered when taken (` 2`, ` 3`, …); without one the film is `film-<id>`, drawn again when taken.
 */
export async function createInWorkspace(workspace: string, given?: string): Promise<Project> {
  const name = given === undefined ? undefined : folderName(given);
  await mkdir(workspace, { recursive: true });
  for (let number = 1; ; number++) {
    const dir = join(workspace, name === undefined ? newFilmName() : number === 1 ? name : `${name} ${number}`);
    try {
      await mkdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    return createProject(dir);
  }
}

/**
 * Renames a project's folder in place, refusing a name another folder or file there already has. Windows can hold a
 * folder for a moment after the processes in it end, so a refused rename is tried again for a short while.
 */
export async function renameProject(path: string, name: unknown): Promise<Project> {
  const from = resolve(path);
  const to = join(dirname(from), folderName(name));
  if (to === from) return projectAt(from);
  // A rename that only changes letters' case is the same folder on Windows and macOS.
  const sameFolder = to.toLowerCase() === from.toLowerCase();
  if (!sameFolder && (await stat(to).then(() => true, () => false))) throw new Error(`There is already a folder named ${basename(to)} beside this project.`);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return projectAt(to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 15 || (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES')) throw error;
      await new Promise((done) => setTimeout(done, 200));
    }
  }
}

/**
 * Copies a project beside it as a new one, `<name> copy` (numbered when that is taken): every file of the person's,
 * none of the Studio's own state, so the copy starts with its own conversation, history and build.
 */
export async function duplicateProject(path: string): Promise<Project> {
  const from = resolve(path);
  const copy = await createInWorkspace(dirname(from), `${basename(from)} copy`);
  const state = join(from, STATE_DIR);
  await cp(from, copy.path, { recursive: true, force: true, filter: (source) => source !== state && !source.startsWith(state + sep) });
  // The copied .gitignore may be the person's own, without the Studio's state in it.
  await ignore(copy.path, [`${STATE_DIR}/`]);
  return projectAt(copy.path);
}

/** Adds each entry (a folder, `name/`) to the folder's .gitignore unless a line already ignores it. */
export async function ignore(path: string, entries: string[]): Promise<void> {
  const file = join(path, '.gitignore');
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const lines = new Set(text.split(/\r?\n/).map((line) => line.trim().replace(/^\/|\/$/g, '')));
  const missing = entries.filter((entry) => !lines.has(entry.replace(/^\/|\/$/g, '')));
  if (!missing.length) return;
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  await writeFile(file, `${text}${separator}${missing.join('\n')}\n`);
}

/** One line of the project library as stored: where the folder is and when the Studio last opened it. */
interface LibraryEntry {
  path: string;
  lastOpened: number;
}

/** A project's cover: a still of its film, kept with the project in the Studio's own state (film/capture.ts). */
export const COVER = 'cover.jpg';

/** The library as stored, most recently opened first. A missing or unreadable file is an empty library. */
async function readLibrary(file: string): Promise<LibraryEntry[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('not a list');
    return parsed.filter(
      (item): item is LibraryEntry => !!item && typeof item.path === 'string' && typeof item.lastOpened === 'number',
    );
  } catch {
    // A corrupt library is not worth stopping the app for: it is rebuilt by the next open.
    console.warn(`Ignoring an unreadable project library: ${file}`);
    return [];
  }
}

/** Serializes every change to one library file, so windows opening projects at once lose none. */
const libraryWrites = new Map<string, Promise<void>>();

async function changeLibrary(file: string, change: (entries: LibraryEntry[]) => LibraryEntry[]): Promise<void> {
  const next = (libraryWrites.get(file) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(change(await readLibrary(file)), null, 2)}\n`);
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  libraryWrites.set(file, next);
  try {
    await next;
  } finally {
    if (libraryWrites.get(file) === next) libraryWrites.delete(file);
  }
}

/** Whether a path is in the library: the only paths the renderer may name itself. */
export async function inLibrary(file: string, path: string): Promise<boolean> {
  return (await readLibrary(file)).some((entry) => entry.path === resolve(path));
}

/** Puts a project at the top of the library, once, opened now. */
export function rememberProject(file: string, project: Project): Promise<void> {
  return changeLibrary(file, (entries) => [
    { path: project.path, lastOpened: Date.now() },
    ...entries.filter((entry) => entry.path !== project.path),
  ]);
}

/** Takes a project off the library. Its folder is never touched. */
export function forgetProject(file: string, path: string): Promise<void> {
  return changeLibrary(file, (entries) => entries.filter((entry) => entry.path !== resolve(path)));
}

/**
 * Every project the person has opened, most recent first: a folder that is gone is kept, marked missing, so it can
 * be located again; a cover is read from the project's own state.
 */
export async function projectLibrary(file: string): Promise<LibraryProject[]> {
  return Promise.all(
    (await readLibrary(file)).map(async ({ path, lastOpened }) => {
      const project = projectAt(path);
      if (!(await isDirectory(path))) return { ...project, film: false, lastOpened, modified: 0, missing: true };
      const modified = project.film ? ((await stat(join(path, 'film.tsx')).catch(() => null))?.mtimeMs ?? 0) : 0;
      const cover = await readFile(join(path, STATE_DIR, COVER)).then(
        (bytes) => `data:image/jpeg;base64,${bytes.toString('base64')}`,
        () => undefined,
      );
      return { ...project, lastOpened, modified, missing: false, cover };
    }),
  );
}
