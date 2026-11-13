import type { Reference } from '../../shared/api';
export const REFERENCES_TAG = '<references>';
export function readReferences(value: unknown): Reference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error('A message carries at most eight references.');
  return value.map((raw) => {
    if (!raw || !['scene', 'layer', 'line', 'asset', 'issue'].includes(raw.kind) || typeof raw.label !== 'string' || !raw.label.trim())
      throw new Error('Not a reference.');
    const result: Reference = { kind: raw.kind, label: raw.label.slice(0, 200) };
    for (const key of ['scene', 'layer', 'line', 'path', 'detail', 'source'] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== 'string') throw new Error('Reference details must be text.');
        result[key] = raw[key].slice(0, key === 'detail' ? 4000 : 300);
      }
    }
    if (raw.time !== undefined) {
      if (typeof raw.time !== 'number' || !Number.isFinite(raw.time) || raw.time < 0) throw new Error('Not a reference time.');
      result.time = raw.time;
    }
    return result;
  });
}
export function describeReferences(refs: Reference[], version: number, locate: Locate = () => null): string {
  const located = refs.map((ref) => {
    const source = ref.kind === 'scene' || ref.kind === 'layer' || ref.kind === 'line' ? locate(ref) : null;
    return source ? { ...ref, source } : ref;
  });
  return `${REFERENCES_TAG}\n${JSON.stringify({ refs: located, version })}\n</references>`;
}

/** Where film.tsx writes a scene, a layer or a line, as `film.tsx:12-18`, or null where it cannot tell. */
export type Locate = (target: { scene?: string; layer?: string; line?: string }) => string | null;

type Span = { kind: 'Scene' | 'Layer' | 'Line'; id: string; scene?: string; from: number; to: number };

/**
 * The <Scene>, <Layer> and <Line> elements film.tsx writes with a literal id, and the lines each spans, so the agent
 * reads the right lines first. One made in a loop or named from a variable is not found, and goes without a place.
 */
export function filmSpans(code: string): Locate {
  const lineAt = (offset: number) => code.slice(0, offset).split('\n').length;
  const spans: Span[] = [];
  const open: Span[] = [];
  for (const match of code.matchAll(/<(\/?)(Scene|Layer|Line)\b([^>]*?)(\/?)>/g)) {
    const [whole, closing, tag, attributes, selfClosing] = match;
    const kind = tag as Span['kind'];
    const end = lineAt(match.index + whole.length);
    if (closing) {
      const i = open.map((o) => o.kind).lastIndexOf(kind);
      if (i >= 0) spans.push({ ...open.splice(i)[0]!, to: end });
      continue;
    }
    const id = /\bid=(?:"([^"]+)"|'([^']+)'|\{\s*["'`]([^"'`]+)["'`]\s*\})/.exec(attributes ?? '');
    const scene = kind === 'Scene' ? undefined : open.findLast((o) => o.kind === 'Scene')?.id;
    const span: Span = { kind, id: id?.[1] ?? id?.[2] ?? id?.[3] ?? '', scene, from: lineAt(match.index), to: end };
    if (selfClosing) spans.push(span);
    else open.push(span);
  }
  const named = spans.filter((s) => s.id);
  const place = (span: Span | undefined) => (span ? `film.tsx:${span.from}${span.to > span.from ? `-${span.to}` : ''}` : null);
  return ({ scene, layer, line }) => {
    if (line) return place(named.find((s) => s.kind === 'Line' && s.id === line));
    if (layer) {
      const layers = named.filter((s) => s.kind === 'Layer' && s.id === layer);
      return place(layers.find((s) => s.scene === scene) ?? layers.find((s) => !s.scene) ?? layers[0]);
    }
    return scene ? place(named.find((s) => s.kind === 'Scene' && s.id === scene)) : null;
  };
}
export function transcriptReferences(text: string): { refs?: Reference[]; version?: number } {
  try {
    const data = JSON.parse(text.slice(REFERENCES_TAG.length, text.lastIndexOf('</references>')).trim());
    return { refs: readReferences(data.refs), version: typeof data.version === 'number' ? data.version : undefined };
  } catch {
    return {};
  }
}
