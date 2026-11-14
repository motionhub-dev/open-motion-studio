import { describe, expect, it, vi } from 'vitest';
import type { Mark } from '../../../shared/api';
import type { Stage } from '../../film/capture';
import { transcript } from '../loop';
import { MARKS_TAG, describeMarks, markedMessage, readMarks, transcriptMarks } from '../marks';

vi.mock('electron', () => ({}));

const title: Mark = {
  t: 2.4,
  box: { x: 0.25, y: 0.4, w: 0.5, h: 0.1 },
  element: { path: 'div#root > h1#title', text: 'A new film', attributes: { 'data-start': '0' }, styles: { 'font-size': '130px', color: 'rgb(255, 255, 255)' }, scene: 'intro', layer: 'title' },
  note: 'Make it "bigger"',
};
const region: Mark = { t: 3, box: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, element: null, note: '' };
const stretch: Mark = { t: 1, end: 2.5, box: { x: 0, y: 0, w: 1, h: 1 }, element: null, note: 'Tighten this part' };

describe('readMarks', () => {
  it('keeps marks as the renderer sent them', () => {
    expect(readMarks([title, region, stretch])).toEqual([title, region, stretch]);
    expect(readMarks(undefined)).toEqual([]);
  });

  it('trims a note, cuts it short, and reads a missing one as empty', () => {
    const [long, none] = readMarks([{ ...region, note: `  ${'a'.repeat(400)}  ` }, { t: 1, box: region.box, element: null }]);
    expect(long?.note).toHaveLength(300);
    expect(none?.note).toBe('');
  });

  it('refuses anything that is not a mark, or too many', () => {
    for (const bad of [
      'x',
      [{ t: 1 }],
      [{ t: -1, box: title.box }],
      [{ t: 1, box: { x: 2, y: 0, w: 0, h: 0 } }],
      [{ ...stretch, end: 0.5 }],
      [{ ...region, note: 3 }],
      Array(6).fill(region),
    ]) {
      expect(() => readMarks(bad)).toThrow();
    }
  });

  it('keeps no element on a stretch of time', () => {
    expect(readMarks([{ ...stretch, element: title.element }])[0]?.element).toBeNull();
  });
});

describe('describeMarks', () => {
  it('names each mark’s moment, place, element, source and note, by number, and keeps the rest of the film', () => {
    const text = describeMarks([title, region, stretch], true, ({ scene, layer }) => (scene === 'intro' && layer === 'title' ? 'film.tsx:12-18' : null));
    expect(text.startsWith(MARKS_TAG)).toBe(true);
    expect(text).toContain(
      '1. At 2.40 s, the element `div#root > h1#title` in layer `title` of scene `intro` (written at film.tsx:12-18) (data-start="0") showing "A new film", drawn at left 25%, top 40%, 50% wide, 10% high, styled font-size: 130px; color: rgb(255, 255, 255). The person asks: "Make it \\"bigger\\""',
    );
    expect(text).toContain('2. At 3.00 s, a region of the frame (left 0%, top 50%, 50% wide, 50% high).\n');
    expect(text).toContain('3. From 1.00 s to 2.50 s, this stretch of the film. The person asks: "Tighten this part"');
    expect(text).toContain('keep the rest of the film');
    expect(text).toContain('outlined in red');
    expect(describeMarks([region], false)).not.toContain('outlined in red');
  });
});

describe('markedMessage', () => {
  const image = { getSize: () => ({ width: 1920, height: 1080 }), resize: () => image, toJPEG: () => Buffer.from('jpeg') };
  const stage = (): Stage => ({ film: { seconds: 6, width: 1920, height: 1080, fps: 30, scenes: [{ id: 'all', start: 0, duration: 6, layers: [], lines: [] }], layers: [], sounds: [] }, frame: vi.fn(async () => image as never), close: vi.fn() });

  it('sends each marked frame, outlined, and a stretch by its middle, to a model that reads images', async () => {
    const opened = stage();
    const blocks = await markedMessage('Make 1 bigger', [title, region, stretch], true, async () => opened);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text', 'text', 'image', 'text', 'image', 'text', 'image']);
    expect(opened.frame).toHaveBeenNthCalledWith(1, 2.4, title.box);
    expect(opened.frame).toHaveBeenNthCalledWith(3, 1.75);
    expect(opened.close).toHaveBeenCalled();
  });

  it('sends the marks described alone, and opens nothing, otherwise', async () => {
    const open = vi.fn();
    const blocks = await markedMessage('Make 1 bigger', [title], false, open);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text']);
    expect(open).not.toHaveBeenCalled();
    expect(await markedMessage('Hello', [], true, open)).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('shows the person’s words and each mark with its note and frame, never what was added for the agent', async () => {
    const content = await markedMessage('Make 1 bigger', [title, region, stretch], true, async () => stage());
    expect(transcript([{ role: 'user', content }])).toEqual([
      {
        kind: 'user',
        text: 'Make 1 bigger',
        marks: [
          { t: 2.4, note: 'Make it "bigger"', image: `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}` },
          { t: 3, note: '', image: expect.stringContaining('data:image/jpeg') },
          { t: 1, end: 2.5, note: 'Tighten this part', image: expect.stringContaining('data:image/jpeg') },
        ],
      },
    ]);
  });

  it('reads the marks back without frames from a model that does not read images', async () => {
    const content = await markedMessage('', [stretch], false, vi.fn());
    expect(transcriptMarks(content as never)).toEqual([{ t: 1, end: 2.5, note: 'Tighten this part' }]);
  });
});
