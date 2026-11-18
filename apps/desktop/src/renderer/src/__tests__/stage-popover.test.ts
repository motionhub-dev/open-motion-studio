import { describe, expect, it } from 'vitest';
import type { PickedElement } from '../../../shared/preview';
import { askPlace, changesOf, hex, lookOf } from '../preview';

const title: PickedElement = {
  path: 'div#root > h1',
  text: 'A new film',
  ownText: 'A new film',
  attributes: {},
  styles: { 'font-size': '130px', color: 'rgb(255, 204, 0)', 'background-color': 'rgba(0, 0, 0, 0)' },
};

describe('the look tried on a picked element', () => {
  it('offers words only for an element of text alone, type for one with words, and a fill only where one is drawn', () => {
    expect(lookOf(title)).toEqual({ text: 'A new film', 'font-size': '130px', 'font-weight': '400', color: 'rgb(255, 204, 0)', opacity: '1' });
    const box: PickedElement = { path: 'div', text: '', attributes: {}, styles: { 'background-color': 'rgb(10, 20, 30)' } };
    expect(lookOf(box)).toEqual({ 'background-color': 'rgb(10, 20, 30)', opacity: '1' });
  });

  it('reads a colour for the colour field, and none from a transparent one', () => {
    expect(hex('rgb(255, 204, 0)')).toBe('#ffcc00');
    expect(hex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(hex('transparent')).toBeNull();
  });

  it('names only what changed, from what the film draws', () => {
    expect(changesOf(title, { 'font-size': '130px', color: '#000000', text: 'Hello' })).toEqual([
      { property: 'color', from: 'rgb(255, 204, 0)', to: '#000000' },
      { property: 'text', from: 'A new film', to: 'Hello' },
    ]);
    expect(changesOf(title, { 'background-color': '#ffffff' })).toEqual([]);
  });
});

it('puts the box below a mark where there is room, and else where it covers least of the mark', () => {
  expect(askPlace({ left: 100, top: 50, width: 100, height: 40 }, 300, 200, 1000, 600)).toEqual({ left: 100, top: 98 });
  // A wide headline near the top of a short stage: no side has room, and below covers less of it than anywhere else.
  const at = askPlace({ left: 70, top: 150, width: 860, height: 150 }, 300, 370, 1000, 590);
  expect(at).toEqual({ left: 70, top: 212 });
});
