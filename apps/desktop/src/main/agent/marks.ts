// The places a person marked on the picture, as the agent reads them: a description of each
// (its moment, its box, the element picked there) and, for a model that reads images, the
// frame at that moment with the box outlined in red. They go with the person's words as one
// message; the words alone are what the assistant panel shows of it.

import type Anthropic from '@anthropic-ai/sdk';
import { MAX_MARKS, type Mark } from '../../shared/api';
import type { Stage } from '../engines/capture';

type Block = Anthropic.Beta.BetaContentBlockParam;

/** The first line of the text that describes a message's marks, by which the transcript knows it. */
export const MARKS_TAG = '<marks>';

const fraction = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** The marks the renderer sent, checked; anything else is refused. */
export function readMarks(value: unknown): Mark[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MARKS) throw new Error(`A message carries at most ${MAX_MARKS} marks.`);
  return value.map((raw) => {
    const mark = raw as Mark;
    const box = mark?.box;
    if (typeof mark?.t !== 'number' || !Number.isFinite(mark.t) || mark.t < 0 || !box || ![box.x, box.y, box.w, box.h].every(fraction)) {
      throw new Error('Not a mark.');
    }
    const element = mark.element
      ? {
          path: String(mark.element.path ?? '').slice(0, 300),
          text: String(mark.element.text ?? '').slice(0, 200),
          attributes: strings(mark.element.attributes),
          styles: strings(mark.element.styles),
        }
      : null;
    return { t: mark.t, box: { x: box.x, y: box.y, w: box.w, h: box.h }, element };
  });
}

/** A record of strings from the renderer, at most eight entries, each cut short. */
const strings = (value: unknown): Record<string, string> =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).slice(0, 8).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 120)]))
    : {};

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** What the agent reads of the marks. */
export function describeMarks(marks: Mark[], pictures: boolean): string {
  const lines = marks.map((mark, i) => {
    const where = `left ${percent(mark.box.x)}, top ${percent(mark.box.y)}, ${percent(mark.box.w)} wide, ${percent(mark.box.h)} high`;
    if (!mark.element) return `${i + 1}. At ${mark.t.toFixed(2)} s, a region of the frame (${where}).`;
    const attributes = Object.entries(mark.element.attributes).map(([k, v]) => `${k}="${v}"`).join(' ');
    const words = mark.element.text ? ` showing "${mark.element.text}"` : '';
    const styles = Object.entries(mark.element.styles).map(([k, v]) => `${k}: ${v}`).join('; ');
    return `${i + 1}. At ${mark.t.toFixed(2)} s, the element \`${mark.element.path}\`${attributes ? ` (${attributes})` : ''}${words}, drawn at ${where}${styles ? `, styled ${styles}` : ''}.`;
  });
  return [
    MARKS_TAG,
    'The person marked these places on the picture. Their message may refer to them by number.',
    ...lines,
    pictures ? 'The frame at each moment follows, the marked place outlined in red.' : '',
    '</marks>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The person's message as the agent receives it: their words, the marks described, and each marked frame. */
export async function markedMessage(text: string, marks: Mark[], pictures: boolean, stage: () => Promise<Stage>): Promise<Block[]> {
  const blocks: Block[] = [];
  if (text) blocks.push({ type: 'text', text });
  if (!marks.length) return blocks;
  blocks.push({ type: 'text', text: describeMarks(marks, pictures) });
  if (!pictures) return blocks;
  const open = await stage();
  try {
    for (const [i, mark] of marks.entries()) {
      const image = await open.frame(Math.min(mark.t, open.film.seconds - 1 / open.film.fps), mark.box);
      const shown = image.getSize().width > 1280 ? image.resize({ width: 1280 }) : image;
      blocks.push({ type: 'text', text: `Mark ${i + 1}:` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shown.toJPEG(85).toString('base64') } });
    }
  } finally {
    open.close();
  }
  return blocks;
}
