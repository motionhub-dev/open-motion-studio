// Motions in a project, and motionhub.dev's catalogue. A project keeps its motions the way
// @motionhub/cli does, so a project made in the Studio and one made with the CLI are the
// same: a motion from the hub in motions/@<scope>/<slug>/, recorded in motions.lock.json,
// and one of the project's own in motions/<name>/ (motionhub's SPEC.md §13). The Studio
// never changes a copy taken from the hub.

import type { HubMotion } from '@motionhub/cli/hub';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { STATE_DIR } from './project';
import type { CatalogueMotion, MotionDetail, ProjectMotion } from '../shared/api';

/** The CLI's library is ESM with top-level await, so the CommonJS main process imports it when first needed. */
const hub = () => import('@motionhub/cli/hub');

export const HUB = 'https://motionhub.dev';
const MOTIONS = 'motions';

/** How long the catalogue's index is kept before it is fetched again. */
const INDEX_MS = 5 * 60_000;

let cached: { base: string; at: number; rows: HubMotion[] } | null = null;

async function rows(base: string): Promise<HubMotion[]> {
  if (cached && cached.base === base && Date.now() - cached.at < INDEX_MS) return cached.rows;
  const fetched = await (await hub()).index(base);
  cached = { base, at: Date.now(), rows: fetched };
  return fetched;
}

const english = (text: Record<string, string> | undefined): string => (text ? (text.en ?? Object.values(text)[0] ?? '') : '');

function row(motion: HubMotion, base: string): CatalogueMotion {
  return {
    id: motion.slug,
    version: motion.version,
    name: english(motion.name),
    line: english(motion.line),
    fit: english(motion.fit?.for),
    tags: motion.tags,
    poster: motion.poster ? new URL(motion.poster, base).href : null,
    page: new URL(`/m/${motion.slug}`, base).href,
  };
}

/** The catalogue's motions that contain every word (all of them for none). */
export async function searchMotions(words: string, base = HUB): Promise<CatalogueMotion[]> {
  const { search } = await hub();
  return search(await rows(base), words.split(/\s+/).filter(Boolean)).map((motion) => row(motion, base));
}

/** Takes the newest version of motion `id` from the catalogue into the project and records it in the lock. */
export async function useMotion(dir: string, id: unknown, base = HUB): Promise<ProjectMotion> {
  if (typeof id !== 'string' || !/^@[A-Za-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error(`Not a motion id: ${String(id)}`);
  const { getMotion, motionPath, readLock, writeLock } = await hub();
  const out = motionPath(id, dir);
  if (existsSync(out)) throw new Error(`The project already holds ${id}.`);
  const lock = readLock(dir);
  const taken = await getMotion(id, out, base, await rows(base));
  lock.motions[id] = { version: taken.version, sha256: taken.package.sha256 };
  writeLock(lock, dir);
  return described(dir, id, taken.version);
}

async function described(dir: string, id: string, version: string | null): Promise<ProjectMotion> {
  const folder = join(dir, MOTIONS, ...id.split('/'));
  let manifest: { name?: Record<string, string>; line?: Record<string, string> } = {};
  try {
    manifest = JSON.parse(await readFile(join(folder, 'motion.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const path = join(MOTIONS, ...id.split('/'));
  return {
    id,
    path,
    name: english(manifest.name) || id,
    line: english(manifest.line),
    version,
    fromHub: id.startsWith('@'),
    poster: existsSync(join(folder, 'poster.jpg')) ? web(join(path, 'poster.jpg')) : null,
  };
}

/** A path relative to the project, with forward slashes, as a URL under the preview scheme's /project/ takes it. */
const web = (path: string) => path.split(/[/\\]/).join('/');

const read = async (file: string): Promise<string> => {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
};

/** A literal string member of a component's `meta`, read as text, as motionhub's own checker reads it. */
function metaString(source: string, member: string): string {
  const meta = /export const meta\s*=\s*\{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '';
  const english = new RegExp(`${member}:\\s*\\{[^}]*?\\ben:\\s*(['"\`])((?:(?!\\1).)*)\\1`).exec(meta);
  if (english) return english[2]!;
  return new RegExp(`${member}:\\s*(['"\`])((?:(?!\\1).)*)\\1`).exec(meta)?.[2] ?? '';
}

/** What a motion the project holds says and has: its MOTION.md, its colours and its components. */
export async function motionDetail(dir: string, id: unknown): Promise<MotionDetail> {
  const motion = (await projectMotions(dir)).find((m) => m.id === id);
  if (!motion) throw new Error(`The project holds no motion ${String(id)}.`);
  const folder = join(dir, motion.path);
  const tokens =
    (JSON.parse((await read(join(folder, 'tokens.json'))) || '{}') as { color?: Record<string, { $value?: { hex?: string } | string }> })
      .color ?? {};
  const colors = Object.entries(tokens).flatMap(([name, token]) => {
    const value = typeof token?.$value === 'string' ? token.$value : token?.$value?.hex;
    return name.startsWith('$') || !value ? [] : [{ name, value }];
  });
  const parts = join(folder, 'react', 'parts');
  const files = existsSync(parts) ? (await readdir(parts)).filter((f) => f.endsWith('.tsx')).sort() : [];
  const components = await Promise.all(
    files.map(async (file) => {
      const source = await read(join(parts, file));
      const stem = file.slice(0, -'.tsx'.length);
      const preview = join(motion.path, 'react', 'previews', `${stem}.jpg`);
      return {
        file,
        name: metaString(source, 'name') || stem,
        purpose: /purpose:\s*['"](\w+)['"]/.exec(source)?.[1] ?? '',
        line: metaString(source, 'line'),
        preview: existsSync(join(dir, preview)) ? web(preview) : null,
      };
    }),
  );
  return { motion, markdown: await read(join(folder, 'MOTION.md')), colors, components: components.filter((c) => c.purpose || c.line) };
}

const directories = async (dir: string): Promise<string[]> => {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

/** The motions the project holds: from the hub (motions/@scope/slug) and its own (motions/name). */
export async function projectMotions(dir: string): Promise<ProjectMotion[]> {
  const lock = (await hub()).readLock(dir);
  const ids: string[] = [];
  for (const name of await directories(join(dir, MOTIONS))) {
    if (name.startsWith('@')) {
      for (const slug of await directories(join(dir, MOTIONS, name))) ids.push(`${name}/${slug}`);
    } else ids.push(name);
  }
  return Promise.all(ids.sort().map((id) => described(dir, id, lock.motions[id]?.version ?? null)));
}

/** Public catalogue players run under a separate host and CSP, never the project's file surface. */
const REEL_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

async function reelFolder(dir: string): Promise<string> {
  const state = join(dir, STATE_DIR);
  for (const folder of [state, join(state, 'reels')]) {
    try {
      if ((await lstat(folder)).isSymbolicLink()) throw new Error('The reel cache must not be a symbolic link.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(folder, { recursive: true });
  }
  return join(state, 'reels');
}

async function readReelCache(file: string): Promise<Buffer | null> {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('The reel cache file must be a regular file, not a symbolic link.');
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function downloadReel(url: URL): Promise<{ body: Buffer; type: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`The reel could not be loaded (${response.status}).`);
  const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 50 * 1024 * 1024) throw new Error('This reel resource is larger than 50 MB.');
    chunks.push(Buffer.from(chunk));
  }
  return { body: Buffer.concat(chunks), type };
}

/** Only public player assets, with no query parameters, credentials or project files. */
export async function catalogueResource(dir: string, path: string, base = HUB): Promise<{ body: Buffer; type: string }> {
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/play/') || url.search || url.hash)
    throw new Error('Not a catalogue player resource.');
  const extension = extname(url.pathname);
  const type = url.pathname.endsWith('/') || extension === '.html' ? 'text/html' : REEL_TYPES[extension];
  if (!type) throw new Error('Unsupported catalogue player resource.');
  const folder = await reelFolder(dir);
  const file = join(folder, `${createHash('sha256').update(url.href).digest('hex')}.resource`);
  const cached = await readReelCache(file);
  if (cached) return { body: cached, type };
  const fetched = await downloadReel(url);
  if (type !== 'text/html' && fetched.type === 'text/html') throw new Error('The catalogue returned a page instead of a player asset.');
  if (type === 'text/html' && fetched.type !== 'text/html') throw new Error('The catalogue player page is unavailable.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, fetched.body, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return { body: fetched.body, type };
}

export async function motionReel(dir: string, id: unknown, base = HUB): Promise<string | null> {
  const motion = (await rows(base)).find((m) => m.slug === id);
  if (!motion) throw new Error('That motion is not in the catalogue.');
  if (!motion.reel) return null;
  const url = new URL(motion.reel, base);
  if (url.origin !== new URL(base).origin) throw new Error('The motion reel must come from the catalogue host.');
  if (url.pathname.startsWith('/play/')) {
    await catalogueResource(dir, url.pathname, base);
    return `oms-preview://catalogue${url.pathname}`;
  }
  const folder = await reelFolder(dir);
  const name = `${createHash('sha256').update(`${motion.slug}:${motion.version}`).digest('hex')}.mp4`;
  const file = join(folder, name);
  const valid = (body: Buffer) => body.length >= 12 && body.subarray(4, 8).toString() === 'ftyp';
  const cached = await readReelCache(file);
  if (cached && valid(cached)) return `oms-preview://film/reels/${name}`;
  const fetched = await downloadReel(url);
  if (fetched.type === 'text/html' || !valid(fetched.body)) throw new Error('The catalogue returned a page instead of an MP4 reel.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, fetched.body, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return `oms-preview://film/reels/${name}`;
}
