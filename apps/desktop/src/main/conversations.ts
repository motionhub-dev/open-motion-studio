// Past conversations: when a new conversation starts, the one before is kept in the project's own state as it was
// shown, under .motion-studio/conversations/<id>.json, and read back to be shown read-only. Stills are left out:
// they are large, and the film they showed has moved on. Nothing is pruned; the folder is the person's.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatItem, PastConversation } from '../shared/api';
import { STATE_DIR } from './project';

const FOLDER = 'conversations';
const ID = /^\d{13}$/;

/** A conversation's title: its first message, on one line and cut short. */
export const titleOf = (items: ChatItem[]): string =>
  (items.find((item) => item.kind === 'user')?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Keeps a conversation that is being set aside, unless it has nothing the person said; its id, or null. */
export async function archiveConversation(dir: string, items: ChatItem[], at = Date.now()): Promise<string | null> {
  if (!items.some((item) => item.kind === 'user')) return null;
  const kept = items.map((item) => (item.kind === 'tool' && item.result?.image ? { ...item, result: { ...item.result, image: undefined } } : item));
  const folder = join(dir, STATE_DIR, FOLDER);
  await mkdir(folder, { recursive: true });
  const id = String(at);
  await writeFile(join(folder, `${id}.json`), JSON.stringify({ at, title: titleOf(items), items: kept }));
  return id;
}

/** The project's past conversations, newest first, without their entries. */
export async function pastConversations(dir: string): Promise<PastConversation[]> {
  const folder = join(dir, STATE_DIR, FOLDER);
  const names = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  const found: PastConversation[] = [];
  for (const name of names) {
    const id = name.replace(/\.json$/, '');
    if (!ID.test(id)) continue;
    try {
      const saved = JSON.parse(await readFile(join(folder, name), 'utf8')) as { at: number; title: string; items: ChatItem[] };
      found.push({ id, at: saved.at, title: saved.title, messages: saved.items.filter((item) => item.kind === 'user').length });
    } catch {
      // A file that is not one is left where it is, and not listed.
    }
  }
  return found.sort((a, b) => b.at - a.at);
}

/** A past conversation's entries, as they were shown. */
export async function pastConversation(dir: string, id: unknown): Promise<ChatItem[]> {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('Not a past conversation.');
  const saved = JSON.parse(await readFile(join(dir, STATE_DIR, FOLDER, `${id}.json`), 'utf8')) as { items: ChatItem[] };
  return saved.items;
}
