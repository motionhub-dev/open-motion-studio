// Projects on disk: a project is a folder, and the folder is the truth. The Studio
// writes only `.motion-studio/` inside it (its own state, ignored by git) and the
// recent-projects list in the app's userData. See docs/tech/architecture.md
// ("Components").

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { Project } from '../shared/api';

export const STATE_DIR = '.motion-studio';
export const MAX_RECENTS = 10;

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

function projectAt(path: string): Project {
  const absolute = resolve(path);
  return { name: basename(absolute), path: absolute };
}

/** Opens an existing folder as a project. Nothing is written to it. */
export async function openProject(path: string): Promise<Project> {
  if (!(await isDirectory(path))) throw new Error(`Not a folder: ${path}`);
  return projectAt(path);
}

/**
 * Makes a new project in a folder that does not exist yet or is empty: creates the
 * folder, the Studio's state directory, and a .gitignore that leaves that directory out.
 */
export async function createProject(path: string): Promise<Project> {
  if (await isDirectory(path)) {
    const entries = (await readdir(path)).filter((entry) => !IGNORABLE.has(entry));
    if (entries.length > 0) throw new Error(`The folder is not empty: ${path}`);
  }
  await mkdir(join(path, STATE_DIR), { recursive: true });
  await ignoreStateDir(path);
  return projectAt(path);
}

/** Adds `.motion-studio/` to the folder's .gitignore unless a line already ignores it. */
export async function ignoreStateDir(path: string): Promise<void> {
  const file = join(path, '.gitignore');
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const ignored = text
    .split(/\r?\n/)
    .some((line) => [STATE_DIR, `${STATE_DIR}/`, `/${STATE_DIR}`, `/${STATE_DIR}/`].includes(line.trim()));
  if (ignored) return;
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  await writeFile(file, `${text}${separator}${STATE_DIR}/\n`);
}

/** The recent list as stored, most recent first. A missing or unreadable file is an empty list. */
async function readRecentPaths(file: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    // A corrupt list is not worth stopping the app for: it is rebuilt by the next open.
    console.warn(`Ignoring an unreadable recent-projects list: ${file}`);
    return [];
  }
}

/** Recent projects whose folders still exist, most recent first. */
export async function recentProjects(file: string): Promise<Project[]> {
  const projects: Project[] = [];
  for (const path of await readRecentPaths(file)) {
    if (await isDirectory(path)) projects.push(projectAt(path));
  }
  return projects;
}

/** Whether a path is on the recent list: the only paths the renderer may name itself. */
export async function isRecent(file: string, path: string): Promise<boolean> {
  return (await readRecentPaths(file)).includes(resolve(path));
}

/** Puts a project at the top of the recent list, once, keeping at most MAX_RECENTS. */
export async function rememberProject(file: string, project: Project): Promise<void> {
  const paths = [project.path, ...(await readRecentPaths(file)).filter((path) => path !== project.path)];
  await writeFile(file, `${JSON.stringify(paths.slice(0, MAX_RECENTS), null, 2)}\n`);
}
