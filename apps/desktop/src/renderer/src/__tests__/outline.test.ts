import { expect, it } from 'vitest';
import { sceneProgress } from '../outline';

it('marks a scene on the rail as before, playing (with how far in) or played, its end the next scene’s start', () => {
  const scene = { id: 'two', start: 4, duration: 2, layers: [], lines: [] };
  expect(sceneProgress(scene, 3.99)).toEqual({ state: 'next', done: 0 });
  expect(sceneProgress(scene, 4)).toEqual({ state: 'playing', done: 0 });
  expect(sceneProgress(scene, 5.5)).toEqual({ state: 'playing', done: 0.75 });
  expect(sceneProgress(scene, 6)).toEqual({ state: 'played', done: 1 });
});
