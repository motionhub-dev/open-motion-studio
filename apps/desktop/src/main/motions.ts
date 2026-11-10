// Motions in a project, and motionhub.dev's catalogue. A project keeps its motions the way
// @motionhub/cli does, so a project made in the Studio and one made with the CLI are the
// same: a motion from the hub in motions/@<scope>/<slug>/, recorded in motions.lock.json,
// and one of the project's own in motions/<name>/ (motionhub's SPEC.md §13). The Studio
// never changes a copy taken from the hub.

import type { HubMotion } from '@motionhub/cli/hub';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogueMotion, ProjectMotion } from '../shared/api';

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

const english = (text: Record<string, string> | undefined): string =>
  text ? (text.en ?? Object.values(text)[0] ?? '') : '';

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
  return {
    id,
    path: join(MOTIONS, ...id.split('/')),
    name: english(manifest.name) || id,
    line: english(manifest.line),
    version,
    fromHub: id.startsWith('@'),
  };
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
