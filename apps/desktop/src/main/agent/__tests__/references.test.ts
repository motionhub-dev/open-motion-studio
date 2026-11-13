import { expect, it } from 'vitest';
import { describeReferences, filmSpans, readReferences, transcriptReferences } from '../references';
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
  ).toEqual([{ kind: 'user', text: 'Make this smaller', marks: [], refs, version: 3 }]);
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
it('finds where film.tsx writes a scene, a layer and a line', () => {
  const locate = filmSpans(
    [
      "import { Film, Scene, Layer, Line } from '@motionhub/runtime';",
      'export default function Main() {',
      '  return (',
      '    <Film>',
      '      <Layer id="logo" x={0} y={0} w={100} h={100}><Logo /></Layer>',
      '      <Scene id="intro" duration={3}>',
      '        <Line id="hello">Hello</Line>',
      '        <Layer id="title" x={0} y={0} w={1920} h={200}>',
      '          <Title />',
      '        </Layer>',
      '      </Scene>',
      "      <Scene id={'outro'} duration={2}>",
      '        <Layer id="title" x={0} y={0} w={10} h={10} />',
      '      </Scene>',
      '    </Film>',
      '  );',
      '}',
    ].join('\n'),
  );
  expect(locate({ scene: 'intro' })).toBe('film.tsx:6-11');
  expect(locate({ scene: 'intro', layer: 'title' })).toBe('film.tsx:8-10');
  expect(locate({ scene: 'outro', layer: 'title' })).toBe('film.tsx:13');
  expect(locate({ layer: 'logo' })).toBe('film.tsx:5');
  expect(locate({ line: 'hello' })).toBe('film.tsx:7');
  expect(locate({ scene: 'missing' })).toBeNull();
  const text = describeReferences([{ kind: 'scene', label: 'Intro', scene: 'intro' }, { kind: 'asset', label: 'a.png', path: 'media/a.png' }], 1, locate);
  expect(transcriptReferences(text).refs).toEqual([
    { kind: 'scene', label: 'Intro', scene: 'intro', source: 'film.tsx:6-11' },
    { kind: 'asset', label: 'a.png', path: 'media/a.png' },
  ]);
});
