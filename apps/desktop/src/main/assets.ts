// Local, creator-supplied images and fonts. Paths entering this module come only from
// the native picker; the renderer can name only an asset already listed by the app.
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { Asset } from '../shared/api';
import { writablePath } from './agent/tools';
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);
const FONTS = new Set(['.woff', '.woff2', '.ttf', '.otf']);
export const ASSET_EXTENSIONS = [...IMAGES, ...FONTS].map((ext) => ext.slice(1));
const kind = (file: string): Asset['kind'] | null =>
  IMAGES.has(extname(file).toLowerCase()) ? 'image' : FONTS.has(extname(file).toLowerCase()) ? 'font' : null;
export async function projectAssets(dir: string): Promise<Asset[]> {
  const assets: Asset[] = [];
  const folder = await writablePath(dir, 'media');
  const walk = async (path: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (assets.length >= 2000) throw new Error('This media folder contains more than 2,000 files. Split it into smaller projects.');
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && kind(file))
        assets.push({
          path: relative(dir, file).split('\\').join('/'),
          name: entry.name,
          kind: kind(file)!,
          bytes: (await stat(file)).size,
        });
    }
  };
  await walk(folder);
  return assets.sort((a, b) => a.name.localeCompare(b.name));
}
export async function importAssets(dir: string, paths: string[]): Promise<Asset[]> {
  for (const path of paths) {
    if (!kind(path)) throw new Error(`${basename(path)} is not a supported image or font.`);
    if (!(await stat(path)).isFile() || (await stat(path)).size > 50 * 1024 * 1024)
      throw new Error(`${basename(path)} must be a file smaller than 50 MB.`);
  }
  for (const path of paths) {
    const name = basename(path);
    const extension = extname(name);
    const stem = basename(name, extension);
    for (let n = 0; ; n++) {
      const destination = await writablePath(dir, `media/${stem}${n ? `-${n + 1}` : ''}${extension}`);
      await mkdir(dirname(destination), { recursive: true });
      if ((await realpath(path)) === (await realpath(destination).catch(() => ''))) break;
      try {
        await copyFile(path, destination, constants.COPYFILE_EXCL);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
  }
  return projectAssets(dir);
}
