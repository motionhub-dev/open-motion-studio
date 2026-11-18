import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChatItem } from '../../shared/api';
import { archiveConversation, pastConversation, pastConversations } from '../conversations';

vi.mock('electron', () => ({}));

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-conversations-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const talk: ChatItem[] = [
  { kind: 'user', text: '  Make a 15 second\nteaser  ', marks: [] },
  { kind: 'tool', id: 't1', name: 'look', summary: 'Looked at the film', result: { ok: true, text: 'frame', image: 'data:image/jpeg;base64,AAAA' } },
  { kind: 'assistant', text: 'Done.' },
  { kind: 'user', text: 'Brighter', marks: [] },
];

it('keeps a conversation set aside, without its stills, and lists it newest first', async () => {
  expect(await archiveConversation(dir, talk, 1700000000000)).toBe('1700000000000');
  await archiveConversation(dir, [{ kind: 'user', text: 'Later', marks: [] }], 1700000001000);
  expect(await pastConversations(dir)).toEqual([
    { id: '1700000001000', at: 1700000001000, title: 'Later', messages: 1 },
    { id: '1700000000000', at: 1700000000000, title: 'Make a 15 second teaser', messages: 2 },
  ]);
  const items = await pastConversation(dir, '1700000000000');
  expect(items).toHaveLength(4);
  expect(items[1]).toMatchObject({ kind: 'tool', result: { ok: true, text: 'frame' } });
  expect((items[1] as Extract<ChatItem, { kind: 'tool' }>).result?.image).toBeUndefined();
});

it('keeps nothing where the person said nothing, and reads only what it kept', async () => {
  expect(await archiveConversation(dir, [{ kind: 'assistant', text: 'Hello' }])).toBeNull();
  expect(await pastConversations(dir)).toEqual([]);
  await archiveConversation(dir, talk, 1700000000000);
  await writeFile(join(dir, '.motion-studio', 'conversations', 'notes.json'), '{}');
  expect((await pastConversations(dir)).map((c) => c.id)).toEqual(['1700000000000']);
  for (const bad of ['../session', 'notes', 42]) await expect(pastConversation(dir, bad)).rejects.toThrow('Not a past conversation');
  expect(await readdir(join(dir, '.motion-studio', 'conversations'))).toContain('notes.json');
});
