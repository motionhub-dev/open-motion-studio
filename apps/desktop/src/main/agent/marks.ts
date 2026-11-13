// The places a person marked on the picture, and the stretches of time they marked on the
// timeline, as the agent reads them: a description of each (its moment, its box, the element
// picked there, where film.tsx writes it, what the person says should change there) and, for a
// model that reads images, the frame at that moment with the box outlined in red. They go with
// the person's words as one message; the assistant panel shows the words, and each mark by its
// moment, its note and the frame the model saw.

import type Anthropic from '@anthropic-ai/sdk';
import { MARK_NOTE, MAX_MARKS, type Mark, type SentMark } from '../../shared/api';
import type { Stage } from '../film/capture';
import type { Locate } from './references';

type Block = Anthropic.Beta.BetaContentBlockParam;

/** The first line of the text that describes a message's marks, by which the transcript knows it. */
export const MARKS_TAG = '<marks>';

const fraction = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const moment = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The marks the renderer sent, checked; anything else is refused. */
export function readMarks(value: unknown): Mark[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MARKS) throw new Error(`A message carries at most ${MAX_MARKS} marks.`);
  return value.map((raw) => {
    const mark = raw as Mark;
    const box = mark?.box;
    if (!moment(mark?.t) || !box || ![box.x, box.y, box.w, box.h].every(fraction)) throw new Error('Not a mark.');
    if (mark.end !== undefined && (!moment(mark.end) || mark.end <= mark.t)) throw new Error('Not a stretch of the film.');
    if (mark.note !== undefined && typeof mark.note !== 'string') throw new Error('A mark’s note must be text.');
    const element = mark.element
      ? {
          path: String(mark.element.path ?? '').slice(0, 300),
          text: String(mark.element.text ?? '').slice(0, 200),
          attributes: strings(mark.element.attributes),
          styles: strings(mark.element.styles),
          ...(typeof mark.element.scene === 'string' ? { scene: mark.element.scene.slice(0, 60) } : {}),
          ...(typeof mark.element.layer === 'string' ? { layer: mark.element.layer.slice(0, 60) } : {}),
        }
      : null;
    return {
      t: mark.t,
      ...(mark.end !== undefined ? { end: mark.end } : {}),
      box: { x: box.x, y: box.y, w: box.w, h: box.h },
      element: mark.end !== undefined ? null : element,
      note: (mark.note ?? '').trim().slice(0, MARK_NOTE),
    };
  });
}

/** A record of strings from the renderer, at most eight entries, each cut short. */
const strings = (value: unknown): Record<string, string> =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).slice(0, 8).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 120)]))
    : {};

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** How a mark's note ends its line, written so the transcript can read it back. */
const ASKED = ' The person asks: ';

/** What the agent reads of the marks. */
export function describeMarks(marks: Mark[], pictures: boolean, locate: Locate = () => null): string {
  const lines = marks.map((mark, i) => {
    const asked = mark.note ? `${ASKED}${JSON.stringify(mark.note)}` : '';
    if (mark.end !== undefined) return `${i + 1}. From ${mark.t.toFixed(2)} s to ${mark.end.toFixed(2)} s, this stretch of the film.${asked}`;
    const where = `left ${percent(mark.box.x)}, top ${percent(mark.box.y)}, ${percent(mark.box.w)} wide, ${percent(mark.box.h)} high`;
    if (!mark.element) return `${i + 1}. At ${mark.t.toFixed(2)} s, a region of the frame (${where}).${asked}`;
    const attributes = Object.entries(mark.element.attributes).map(([k, v]) => `${k}="${v}"`).join(' ');
    const words = mark.element.text ? ` showing "${mark.element.text}"` : '';
    const styles = Object.entries(mark.element.styles).map(([k, v]) => `${k}: ${v}`).join('; ');
    const { scene, layer } = mark.element;
    const within = layer ? ` in layer \`${layer}\`${scene ? ` of scene \`${scene}\`` : ''}` : scene ? ` in scene \`${scene}\`` : '';
    const source = layer || scene ? locate({ scene, layer }) : null;
    return `${i + 1}. At ${mark.t.toFixed(2)} s, the element \`${mark.element.path}\`${within}${source ? ` (written at ${source})` : ''}${attributes ? ` (${attributes})` : ''}${words}, drawn at ${where}${styles ? `, styled ${styles}` : ''}.${asked}`;
  });
  return [
    MARKS_TAG,
    'The person marked these places on the film. Their message may refer to them by number.',
    ...lines,
    'Change what is asked at these places; keep the rest of the film, its timing included, as it is unless asked.',
    pictures ? 'The frame at each moment follows, the marked place outlined in red.' : '',
    '</marks>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The marks as the conversation shows them again, read from their description and the frames sent after it. */
export function transcriptMarks(blocks: readonly { type: string; text?: string; source?: unknown }[]): SentMark[] {
  const described = blocks.find((b) => b.type === 'text' && b.text?.startsWith(MARKS_TAG))?.text;
  if (!described) return [];
  const marks: SentMark[] = [];
  for (const line of described.split('\n')) {
    const at = /^(\d+)\. (?:At ([\d.]+) s|From ([\d.]+) s to ([\d.]+) s)/.exec(line);
    if (!at) continue;
    // The note is the JSON string that ends the line.
    const asked = new RegExp(`${ASKED}("(?:[^"\\\\]|\\\\.)*")$`).exec(line);
    const note = asked ? String(JSON.parse(asked[1]!)) : '';
    marks.push(at[2] !== undefined ? { t: Number(at[2]), note } : { t: Number(at[3]), end: Number(at[4]), note });
  }
  // Each frame follows its caption, `Mark N:`.
  blocks.forEach((block, i) => {
    const n = block.type === 'text' ? /^Mark (\d+):$/.exec(block.text ?? '')?.[1] : undefined;
    const image = blocks[i + 1]?.source as { type?: string; media_type?: string; data?: string } | undefined;
    const mark = n ? marks[Number(n) - 1] : undefined;
    if (mark && image?.type === 'base64' && image.data) mark.image = `data:${image.media_type};base64,${image.data}`;
  });
  return marks;
}

/** The person's message as the agent receives it: their words, the marks described, and each marked frame. */
export async function markedMessage(
  text: string,
  marks: Mark[],
  pictures: boolean,
  stage: () => Promise<Stage>,
  locate?: Locate,
): Promise<Block[]> {
  const blocks: Block[] = [];
  if (text) blocks.push({ type: 'text', text });
  if (!marks.length) return blocks;
  blocks.push({ type: 'text', text: describeMarks(marks, pictures, locate) });
  if (!pictures) return blocks;
  const open = await stage();
  try {
    const last = open.film.seconds - 1 / open.film.fps;
    for (const [i, mark] of marks.entries()) {
      // A stretch of time is shown by its middle, the whole frame and nothing outlined.
      const image =
        mark.end !== undefined ? await open.frame(Math.min((mark.t + mark.end) / 2, last)) : await open.frame(Math.min(mark.t, last), mark.box);
      const shown = image.getSize().width > 1280 ? image.resize({ width: 1280 }) : image;
      blocks.push({ type: 'text', text: `Mark ${i + 1}:` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shown.toJPEG(85).toString('base64') } });
    }
  } finally {
    open.close();
  }
  return blocks;
}
