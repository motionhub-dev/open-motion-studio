import { describe, expect, it } from 'vitest';
import type { Asset, ProjectMotion } from '../../../shared/api';
import type { FilmInfo } from '../../../shared/preview';
import { matchPicks, mentionAt, pickables } from '../reference-picker';
import { readReferences } from '../../../main/agent/references';

const box = { x: 0, y: 0, w: 10, h: 10, z: 0 };
const film: FilmInfo = {
  seconds: 7,
  width: 1920,
  height: 1080,
  fps: 30,
  layers: [{ ...box, id: 'grain' }],
  scenes: [
    { id: 'open', start: 0, duration: 4, layers: [{ ...box, id: 'artwork' }], lines: [{ id: 'title', text: 'MAKE IT MOVE' }, { id: 'sub', text: 'A few words.' }] },
    { id: 'close', start: 4, duration: 3, layers: [{ ...box, id: 'closing' }], lines: [{ id: 'end', text: 'Make it yours.' }] },
  ],
};
const assets: Asset[] = [{ path: 'assets/logo.png', name: 'logo.png', kind: 'image', bytes: 10 }];
const motions: ProjectMotion[] = [
  { id: '@hub/kinetic-title', path: 'motions/@hub/kinetic-title', name: 'Kinetic title', line: 'Words that land', version: '1.0.0', fromHub: true, poster: null },
];

describe('the @ picker', () => {
  const picks = pickables(film, assets, motions);

  it('offers the film’s scenes, layers and lines and the project’s assets and motions, as references the IPC takes', () => {
    expect(picks.map((p) => `${p.group}:${p.label}`)).toEqual([
      'Scenes:MAKE IT MOVE',
      'Scenes:Make it yours.',
      'Layers:grain',
      'Layers:artwork',
      'Layers:closing',
      'Lines:MAKE IT MOVE',
      'Lines:A few words.',
      'Lines:Make it yours.',
      'Assets:logo.png',
      'Motions:Kinetic title',
    ]);
    expect(picks.find((p) => p.label === 'artwork')!.ref).toEqual({ kind: 'layer', label: 'artwork', scene: 'open', layer: 'artwork', time: 0.5 });
    expect(picks.find((p) => p.group === 'Lines' && p.label === 'Make it yours.')!.ref).toMatchObject({ kind: 'line', scene: 'close', line: 'end', time: 4 });
    // What the tray sends is what the main process validates, unchanged.
    for (const at of [0, 8]) {
      const refs = picks.slice(at, at + 8).map((p) => p.ref);
      expect(readReferences(refs)).toEqual(refs);
    }
  });

  it('narrows by every word typed, in its groups’ order, a pick starting with it first', () => {
    // A layer or line matches by its scene's title too.
    expect(matchPicks(picks, 'make').map((p) => `${p.group}:${p.label}`)).toEqual([
      'Scenes:MAKE IT MOVE',
      'Scenes:Make it yours.',
      'Layers:artwork',
      'Layers:closing',
      'Lines:MAKE IT MOVE',
      'Lines:Make it yours.',
      'Lines:A few words.',
    ]);
    expect(matchPicks(picks, 'it yours').map((p) => `${p.group}:${p.label}`)).toEqual(['Scenes:Make it yours.', 'Layers:closing', 'Lines:Make it yours.']);
    expect(matchPicks(picks, 'clos').map((p) => `${p.group}:${p.label}`)).toEqual(['Layers:closing']);
    expect(matchPicks(picks, 'hub').map((p) => p.label)).toEqual(['Kinetic title']);
    expect(matchPicks(picks, 'nothing like it')).toEqual([]);
  });

  it('shows the first few of each group while nothing is typed', () => {
    const many = pickables({ ...film, layers: Array.from({ length: 9 }, (_, i) => ({ ...box, id: `l${i}` })) }, assets, motions);
    expect(matchPicks(many, '').filter((p) => p.group === 'Layers')).toHaveLength(5);
    expect(matchPicks(many, '').filter((p) => p.group === 'Scenes')).toHaveLength(2);
  });

  it('opens on an @ at a word’s start, and reads what follows it up to the caret', () => {
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionAt('make @art', 9)).toEqual({ start: 5, query: 'art' });
    expect(mentionAt('make @art bigger', 9)).toEqual({ start: 5, query: 'art' });
    expect(mentionAt('make @art bigger', 16)).toBeNull();
    expect(mentionAt('mail me@example.com', 19)).toBeNull();
  });
});
