import { expect, it } from 'vitest';
import { codeReference, treeOf } from '../code-view';

it('lays the project’s files out as a tree, folders before files, each by name', () => {
  const file = (path: string) => ({ path, bytes: 1, text: true });
  const tree = treeOf([file('film.tsx'), file('parts/title.tsx'), file('parts/a/b.tsx'), file('README.md')]);
  expect(tree.map((n) => n.name)).toEqual(['parts', 'film.tsx', 'README.md']);
  expect(tree[0]!.children.map((n) => n.name)).toEqual(['a', 'title.tsx']);
  expect(tree[0]!.children[0]!.children[0]!.path).toBe('parts/a/b.tsx');
});

it('sends picked lines with where they are and what they say', () => {
  const text = ['one', 'two', 'three', 'four'].join('\n');
  expect(codeReference('parts/title.tsx', text, 2, 3)).toEqual({
    kind: 'code',
    label: 'parts/title.tsx:2-3',
    path: 'parts/title.tsx',
    source: 'parts/title.tsx:2-3',
    detail: 'Lines 2-3 of parts/title.tsx:\ntwo\nthree',
  });
  expect(codeReference('film.tsx', text, 4, 4).label).toBe('film.tsx:4');
});
