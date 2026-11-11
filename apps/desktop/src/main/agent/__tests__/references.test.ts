import { expect, it } from 'vitest';
import { describeReferences, readReferences, transcriptReferences } from '../references';
import { transcript } from '../loop';
it('keeps references separate from the creator’s words, including after reload', () => {
  const refs = readReferences([{ kind: 'layer', label: 'Title', scene: 'intro', layer: 'title', time: 1 }]);
  const text = describeReferences(refs, 3);
  expect(transcriptReferences(text)).toEqual({ refs, version: 3 });
  expect(
    transcript([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Make this smaller' },
          { type: 'text', text },
        ],
      },
    ]),
  ).toEqual([{ kind: 'user', text: 'Make this smaller', marks: 0, refs, version: 3 }]);
});
it('rejects invalid references and bounds their payloads', () => {
  for (const value of [
    [{ kind: 'unknown', label: 'x' }],
    [{ kind: 'scene', label: 'x', time: NaN }],
    Array(9).fill({ kind: 'scene', label: 'x' }),
  ])
    expect(() => readReferences(value)).toThrow();
  expect(readReferences([{ kind: 'issue', label: 'x', detail: 'a'.repeat(5000) }])[0]?.detail).toHaveLength(4000);
});
