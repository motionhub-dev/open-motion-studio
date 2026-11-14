import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../../../shared/api';
import type { FilmInfo } from '../../../shared/preview';
import { blocks, changeKey, changeLine, failingRun, filmChanges, outcomeOf, turnFacts, turnLine, workedFor } from '../activity';

describe('how long a turn took', () => {
  it('says seconds under a minute and minutes with seconds past it, never zero', () => {
    expect(workedFor(0.2)).toBe('Worked for 1s');
    expect(workedFor(59.4)).toBe('Worked for 59s');
    expect(workedFor(59.6)).toBe('Worked for 1m 0s');
    expect(workedFor(499)).toBe('Worked for 8m 19s');
  });
});

const tool = (id: string, name: string, summary: string, ok?: boolean): ChatItem => ({
  kind: 'tool',
  id,
  name,
  summary,
  ...(ok === undefined ? {} : { result: { ok, text: '' } }),
});

describe('the conversation as blocks', () => {
  it('folds a turn’s work into one block, with what the agent said between its calls, and keeps its answer and a question out', () => {
    const items: ChatItem[] = [
      { kind: 'user', text: 'Go', marks: [] },
      { kind: 'assistant', text: 'Let me look.' },
      tool('1', 'read_file', 'Reading film.tsx', true),
      tool('2', 'edit_file', 'Editing film.tsx', true),
      { kind: 'assistant', text: 'Now checking.' },
      tool('3', 'check', 'Checking the film', true),
      { kind: 'assistant', text: 'Done. Which look?' },
      { ...(tool('4', 'ask_person', 'Asking you', true) as Extract<ChatItem, { kind: 'tool' }>), ask: { question: 'Which?', options: [] } },
      { kind: 'user', text: 'The first', marks: [] },
      tool('5', 'edit_file', 'Editing film.tsx', true),
      { kind: 'assistant', text: 'Done.' },
    ];
    const drawn = blocks(items);
    expect(drawn.map((b) => (b.kind === 'work' ? `work:${b.steps.length}/${b.tools.length}` : b.kind === 'item' ? b.item.kind : b.kind))).toEqual([
      'user',
      'work:5/3',
      'assistant',
      'ask',
      'user',
      'work:1/1',
      'assistant',
    ]);
    const work = drawn[1] as Extract<(typeof drawn)[number], { kind: 'work' }>;
    expect(work.steps.flatMap((s) => (s.kind === 'said' ? [s.text] : []))).toEqual(['Let me look.', 'Now checking.']);
  });

  it('says what a turn gave: its answer after its last call, and how its last check came out', () => {
    const items: ChatItem[] = [
      { kind: 'user', text: 'Go', marks: [] },
      tool('1', 'check', 'Checking the film', false),
      { kind: 'assistant', text: 'Fixing the overlap.' },
      tool('2', 'edit_file', 'Editing parts/gauge.tsx', true),
      tool('3', 'check', 'Checking the film', true),
      { kind: 'assistant', text: 'The gauge sits clear of the caption.' },
    ];
    expect(turnFacts(items, items.length)).toEqual({ answer: 'The gauge sits clear of the caption.', check: true });
    expect(turnFacts(items.slice(0, 3), 3)).toEqual({ answer: 'Fixing the overlap.', check: false });
    expect(outcomeOf(undefined)).toBe('done');
    expect(outcomeOf({ error: false })).toBe('stopped');
    expect(outcomeOf({ error: true })).toBe('failed');
  });

  it('says a turn’s work in a few words, with how many failed', () => {
    const run = [
      tool('1', 'edit_file', 'Editing film.tsx', true),
      tool('2', 'edit_file', 'Editing film.tsx', true),
      tool('3', 'check', 'Checking the film', false),
      tool('4', 'check', 'Checking the film', true),
      tool('5', 'still', 'Looking at 1.0 s', true),
      tool('6', 'read_file', 'Reading film.tsx', true),
      tool('7', 'edit_file', 'Editing parts/gauge.tsx and 2 more', true),
      tool('8', 'still', 'Looking at 2.0 s', true),
    ] as Extract<ChatItem, { kind: 'tool' }>[];
    expect(turnLine(run)).toBe('read 1 file · edited 2 files · checked twice · looked at 2 frames · 1 failed');
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
    sounds: [],
    captions: false,
    scenes: [
      { id: 'intro', start: 0, duration: 4, layers: [{ id: 'title', x: 0, y: 0, w: 1920, h: 200, z: 0 }], lines: [{ id: 'l1', text: 'Hello', start: 0, end: 4 }] },
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
        lines: [{ id: 'l1', text: 'Hello there', start: 0, end: 4 }],
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
