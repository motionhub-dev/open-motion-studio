import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../../../shared/api';
import type { FilmInfo } from '../../../shared/preview';
import { blocks, changeKey, changeLine, failingRun, filmChanges, workLine } from '../activity';

const tool = (id: string, name: string, summary: string, ok?: boolean): ChatItem => ({
  kind: 'tool',
  id,
  name,
  summary,
  ...(ok === undefined ? {} : { result: { ok, text: '' } }),
});

describe('the conversation as blocks', () => {
  it('folds each run of tool calls into one block, and keeps a question on its own', () => {
    const items: ChatItem[] = [
      { kind: 'user', text: 'Go', marks: [] },
      tool('1', 'read_file', 'Reading film.tsx', true),
      tool('2', 'edit_file', 'Editing film.tsx', true),
      { kind: 'assistant', text: 'Done' },
      tool('3', 'check', 'Checking the film', true),
      { ...(tool('4', 'ask_person', 'Asking you', true) as Extract<ChatItem, { kind: 'tool' }>), ask: { question: 'Which?', options: [] } },
    ];
    expect(blocks(items).map((b) => (b.kind === 'work' ? `work:${b.tools.length}` : b.kind))).toEqual([
      'item',
      'work:2',
      'item',
      'work:1',
      'ask',
    ]);
  });

  it('says a run of calls in a few words, with how many failed', () => {
    const run = [
      tool('1', 'edit_file', 'Editing film.tsx', true),
      tool('2', 'edit_file', 'Editing film.tsx', true),
      tool('3', 'check', 'Checking the film', false),
      tool('4', 'check', 'Checking the film', true),
      tool('5', 'still', 'Looking at 1.0 s', true),
    ] as Extract<ChatItem, { kind: 'tool' }>[];
    expect(workLine(run)).toBe('Edited film.tsx · Checked ×2 · Looked · 1 failed');
  });

  it('counts the same tool failing in a row since the person last spoke', () => {
    const items: ChatItem[] = [
      tool('0', 'check', 'Checking the film', false),
      { kind: 'user', text: 'Again', marks: [] },
      tool('1', 'check', 'Checking the film', false),
      tool('2', 'edit_file', 'Editing film.tsx', true),
      tool('3', 'check', 'Checking the film', false),
      tool('4', 'check', 'Checking the film', false),
    ];
    expect(failingRun(items)).toEqual({ name: 'check', times: 2 });
    expect(failingRun([...items, tool('5', 'check', 'Checking the film', true)])).toBeNull();
  });
});

describe('what a turn changed', () => {
  const before: FilmInfo = {
    seconds: 7,
    width: 1920,
    height: 1080,
    fps: 30,
    layers: [{ id: 'logo', x: 0, y: 0, w: 100, h: 100, z: 0 }],
    scenes: [
      { id: 'intro', start: 0, duration: 4, layers: [{ id: 'title', x: 0, y: 0, w: 1920, h: 200, z: 0 }], lines: [{ id: 'l1', text: 'Hello' }] },
      { id: 'outro', start: 4, duration: 3, layers: [], lines: [] },
    ],
  };
  const after: FilmInfo = {
    ...before,
    seconds: 8,
    scenes: [
      {
        id: 'intro',
        start: 0,
        duration: 5,
        layers: [
          { id: 'title', x: 0, y: 100, w: 1920, h: 200, z: 0 },
          { id: 'subtitle', x: 0, y: 400, w: 1920, h: 100, z: 1 },
        ],
        lines: [{ id: 'l1', text: 'Hello there' }],
      },
      { id: 'end', start: 5, duration: 3, layers: [], lines: [] },
    ],
  };

  it('names each scene, layer and line added, changed or removed', () => {
    const changes = filmChanges(before, after);
    expect(changes.map((c) => `${c.change} ${changeKey(c.ref)}`).sort()).toEqual(
      [
        'changed scene:intro::',
        'changed layer:intro:title:',
        'added layer:intro:subtitle:',
        'changed line:intro::l1',
        'added scene:end::',
        'removed scene:outro::',
      ].sort(),
    );
    expect(changeLine(changes)).toBe('+1 scene · +1 layer · ~1 scene · ~1 layer · ~1 line · −1 scene');
    expect(filmChanges(before, before)).toEqual([]);
  });
});
