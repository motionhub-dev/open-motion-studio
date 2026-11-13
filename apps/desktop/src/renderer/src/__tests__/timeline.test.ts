import { expect, it } from 'vitest';
import { ZOOM, scrollToKeep, zoomBy } from '../timeline';

it('keeps the zoom between the whole film and its limit', () => {
  expect(zoomBy(1, 0.5)).toBe(ZOOM.min);
  expect(zoomBy(30, 2)).toBe(ZOOM.max);
  expect(zoomBy(2, 1.25)).toBe(2.5);
});

it('keeps the moment under the pointer where it is when zooming', () => {
  // A 1000 px view at 2× scrolled 300 px: the pointer 200 px in is at 500 px of a 2000 px grid, a quarter in.
  const scroll = scrollToKeep(300, 200, 1000, 2, 4);
  expect((scroll + 200) / 4000).toBeCloseTo(0.25);
  // Zooming out to the whole film scrolls back to the start.
  expect(scrollToKeep(300, 200, 1000, 2, 1)).toBe(50);
  expect(scrollToKeep(0, 900, 1000, 2, 1)).toBe(0);
});
