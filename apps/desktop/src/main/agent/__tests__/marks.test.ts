import { describe, expect, it, vi } from 'vitest';
import type { Mark } from '../../../shared/api';
import type { Stage } from '../../engines/capture';
import { transcript } from '../loop';
import { MARKS_TAG, describeMarks, markedMessage, readMarks } from '../marks';

vi.mock('electron', () => ({}));

const title: Mark = {
  t: 2.4,
  box: { x: 0.25, y: 0.4, w: 0.5, h: 0.1 },
  element: { path: 'div#root > h1#title', text: 'A new film', attributes: { 'data-start': '0' }, styles: { 'font-size': '130px', color: 'rgb(255, 255, 255)' } },
};
const region: Mark = { t: 3, box: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, element: null };

describe('readMarks', () => {
  it('keeps marks as the renderer sent them', () => {
    expect(readMarks([title, region])).toEqual([title, region]);
    expect(readMarks(undefined)).toEqual([]);
  });

  it('refuses anything that is not a mark, or too many', () => {
    for (const bad of ['x', [{ t: 1 }], [{ t: -1, box: title.box }], [{ t: 1, box: { x: 2, y: 0, w: 0, h: 0 } }], Array(6).fill(region)]) {
      expect(() => readMarks(bad)).toThrow();
    }
  });
});

describe('describeMarks', () => {
  it('names each mark’s moment, place and element, by number', () => {
    const text = describeMarks([title, region], true);
    expect(text.startsWith(MARKS_TAG)).toBe(true);
    expect(text).toContain('1. At 2.40 s, the element `div#root > h1#title` (data-start="0") showing "A new film", drawn at left 25%, top 40%, 50% wide, 10% high, styled font-size: 130px; color: rgb(255, 255, 255).');
    expect(text).toContain('2. At 3.00 s, a region of the frame (left 0%, top 50%, 50% wide, 50% high).');
    expect(text).toContain('outlined in red');
    expect(describeMarks([region], false)).not.toContain('outlined in red');
  });
});

describe('markedMessage', () => {
  const image = { getSize: () => ({ width: 1920, height: 1080 }), resize: () => image, toJPEG: () => Buffer.from('jpeg') };
  const stage = (): Stage => ({ film: { seconds: 6, width: 1920, height: 1080, fps: 30 }, frame: vi.fn(async () => image as never), close: vi.fn() });

  it('sends each marked frame, outlined, to a model that reads images', async () => {
    const opened = stage();
    const blocks = await markedMessage('Make 1 bigger', [title, region], true, async () => opened);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text', 'text', 'image', 'text', 'image']);
    expect(opened.frame).toHaveBeenNthCalledWith(1, 2.4, title.box);
    expect(opened.close).toHaveBeenCalled();
  });

  it('sends the marks described alone, and opens nothing, otherwise', async () => {
    const open = vi.fn();
    const blocks = await markedMessage('Make 1 bigger', [title], false, open);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text']);
    expect(open).not.toHaveBeenCalled();
    expect(await markedMessage('Hello', [], true, open)).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('shows the person’s words and the number of marks, never what was added for the agent', async () => {
    const content = await markedMessage('Make 1 bigger', [title, region], true, async () => stage());
    expect(transcript([{ role: 'user', content }])).toEqual([{ kind: 'user', text: 'Make 1 bigger', marks: 2 }]);
  });
});
