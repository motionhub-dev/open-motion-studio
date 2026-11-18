// Where film.tsx writes each <Scene>, <Layer> and <Line>: read by the main process to tell the agent where to look, and by
// the code view to bring those lines into sight.

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

/** The first and last line of a place `filmSpans` gives (`film.tsx:12-18`), or null for none. */
export function spanLines(place: string | null): { from: number; to: number } | null {
  const match = place && /:(\d+)(?:-(\d+))?$/.exec(place);
  return match ? { from: Number(match[1]), to: Number(match[2] ?? match[1]) } : null;
}
