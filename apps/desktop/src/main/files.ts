// The open project's files, for the code view to list and show, read-only: the film's code, the motions it takes and
// its media. Nothing here writes; a path from the renderer is taken only inside the project, through no symbolic link
// and outside its dot folders.

import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import type { ProjectFile } from '../shared/api';
import { projectPath } from './agent/tools';

/** What the code view shows as text, and the largest file it reads. */
const TEXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.css', '.json', '.md', '.html', '.svg', '.txt']);
export const TEXT_BYTES = 1024 * 1024;
/** How many files are listed at most, so a project holding a dependency tree does not stall the panel. */
const MOST = 3000;

/** Every file of the project but its dot folders and node_modules, by path. */
export async function projectFiles(dir: string): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];
  const walk = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      if (files.length >= MOST) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const bytes = (await stat(path)).size;
        files.push({ path: relative(dir, path).split(sep).join('/'), bytes, text: TEXT.has(extname(entry.name).toLowerCase()) && bytes <= TEXT_BYTES });
      }
    }
  };
  await walk(dir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** The file at `path` inside the project, or an error: never through a symbolic link, never in a dot folder. */
async function inside(dir: string, path: unknown): Promise<string> {
  const full = projectPath(dir, path, false);
  const parts = relative(dir, full).split(sep);
  if (parts.some((part) => part.startsWith('.')) || parts[0] === 'node_modules') throw new Error(`${String(path)} is not one of the project's files.`);
  let at = dir;
  for (const part of parts) {
    at = join(at, part);
    if ((await lstat(at)).isSymbolicLink()) throw new Error(`${String(path)} passes through a symbolic link.`);
  }
  if (!(await stat(full)).isFile()) throw new Error(`${String(path)} is not a file.`);
  return full;
}

/** A text file of the project, as it is on disk now. */
export async function readProjectFile(dir: string, path: unknown): Promise<string> {
  const full = await inside(dir, path);
  if (!TEXT.has(extname(full).toLowerCase())) throw new Error(`${String(path)} is not a text file the code view shows.`);
  if ((await stat(full)).size > TEXT_BYTES) throw new Error(`${String(path)} is larger than 1 MB; open it in your editor.`);
  return readFile(full, 'utf8');
}

/** The full path of a project file to open in the system's program for it. */
export const projectFileToOpen = inside;
