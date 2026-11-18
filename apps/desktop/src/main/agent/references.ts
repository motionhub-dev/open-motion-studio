import type { Reference } from '../../shared/api';
import type { Locate } from '../../shared/spans';
export const REFERENCES_TAG = '<references>';
export function readReferences(value: unknown): Reference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new Error('A message carries at most eight references.');
  return value.map((raw) => {
    if (!raw || !['scene', 'layer', 'line', 'asset', 'motion', 'issue', 'code'].includes(raw.kind) || typeof raw.label !== 'string' || !raw.label.trim())
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

export function transcriptReferences(text: string): { refs?: Reference[]; version?: number } {
  try {
    const data = JSON.parse(text.slice(REFERENCES_TAG.length, text.lastIndexOf('</references>')).trim());
    return { refs: readReferences(data.refs), version: typeof data.version === 'number' ? data.version : undefined };
  } catch {
    return {};
  }
}
