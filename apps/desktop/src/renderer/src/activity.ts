// What the agent did, as the assistant panel tells it: the tool calls between its words folded into
// one line of plain words, what it is doing now, whether it keeps failing at the same thing, and how
// the film changed over a turn.

import type { ChatItem, Reference } from '../../shared/api';
import type { FilmInfo, LayerBox } from '../../shared/preview';

type Tool = Extract<ChatItem, { kind: 'tool' }>;

/**
 * Where a turn of the agent ended, as the panel keeps it while the project is open: the film as it was when the
 * person sent the message, the History entry of the files the turn wrote, and how long the turn took in seconds.
 */
export interface TurnEnd {
  kind: 'turn';
  before: FilmInfo | null;
  checkpoint?: string;
  seconds?: number;
}

/** How long a turn took, as the panel says it: `Worked for 8s`, `Worked for 1m 12s`. */
export function workedFor(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `Worked for ${minutes ? `${minutes}m ${whole % 60}s` : `${whole}s`}`;
}

/** A row of the conversation in the panel: what the transcript holds, and where turns ended. */
export type Row = ChatItem | TurnEnd;

/**
 * The conversation as the panel draws it: each item, each run of tool calls as one block, and each question the
 * agent asked as its own block.
 */
export type Block =
  | { kind: 'item'; item: Exclude<Row, Tool>; index: number }
  | { kind: 'work'; tools: Tool[] }
  | { kind: 'ask'; tool: Tool & { ask: NonNullable<Tool['ask']> }; index: number };

export function blocks(items: Row[]): Block[] {
  const out: Block[] = [];
  items.forEach((item, index) => {
    const last = out[out.length - 1];
    if (item.kind !== 'tool') out.push({ kind: 'item', item, index });
    else if (item.ask) out.push({ kind: 'ask', tool: { ...item, ask: item.ask }, index });
    else if (last?.kind === 'work') last.tools.push(item);
    else out.push({ kind: 'work', tools: [item] });
  });
  return out;
}

/** The path a tool call's summary names, for the calls that name one. */
const pathOf = (tool: Tool) => /^(?:Writing|Editing|Reading) (.+)$/.exec(tool.summary)?.[1];

/** A run of tool calls in a few words: `Edited film.tsx · Checked ×2 · Looked ×3`. */
export function workLine(tools: Tool[]): string {
  const edited = new Set<string>();
  const counts = new Map<string, number>();
  for (const tool of tools) {
    if (tool.name === 'write_file' || tool.name === 'edit_file') {
      edited.add(pathOf(tool) ?? 'a file');
      continue;
    }
    const verb =
      tool.name === 'check'
        ? 'Checked'
        : tool.name === 'still'
          ? 'Looked'
          : tool.name === 'read_file' || tool.name === 'list_files'
            ? 'Read'
            : tool.name === 'search_motions'
              ? 'Searched motionhub'
              : tool.name === 'use_motion'
                ? 'Took a motion'
                : tool.name === 'shell'
                  ? 'Ran a command'
                  : tool.name === 'web_search'
                    ? 'Searched the web'
                    : tool.name;
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  const parts = [
    ...(edited.size ? [`Edited ${[...edited].slice(0, 2).join(', ')}${edited.size > 2 ? ` +${edited.size - 2}` : ''}`] : []),
    ...[...counts].map(([verb, n]) => (n > 1 ? `${verb} ×${n}` : verb)),
  ];
  const failed = tools.filter((t) => t.result && !t.result.ok).length;
  return `${parts.join(' · ')}${failed ? ` · ${failed} failed` : ''}`;
}

/** The tool call still running, if any. */
export const running = (tools: Tool[]) => tools.find((tool) => !tool.result);

/** How many times in a row, at the end of the conversation, the same tool has failed, and which. */
export function failingRun(items: Row[]): { name: string; times: number } | null {
  let name = '';
  let times = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === 'user') break;
    if (item.kind !== 'tool' || !item.result) continue;
    if (item.result.ok) break;
    if (name && item.name !== name) break;
    name = item.name;
    times++;
  }
  return times ? { name, times } : null;
}

/** One thing a turn changed in the film: what it is, how it changed, and a reference that finds it. */
export interface FilmChange {
  change: 'added' | 'removed' | 'changed';
  ref: Reference;
}

const sameBox = (a: LayerBox, b: LayerBox) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.z === b.z;

/**
 * What changed in the film's structure between two builds: its scenes (added, removed, a new length or place), their
 * layers (added, removed, a new box) and lines (added, removed, new words), and its own layers. What a layer draws
 * inside its box is not seen here.
 */
export function filmChanges(before: FilmInfo, after: FilmInfo): FilmChange[] {
  const changes: FilmChange[] = [];
  const layers = (from: LayerBox[], to: LayerBox[], scene: { id?: string; start: number }) => {
    const ref = (layer: LayerBox): Reference => ({
      kind: 'layer',
      label: layer.id,
      layer: layer.id,
      ...(scene.id ? { scene: scene.id } : {}),
      time: scene.start,
    });
    for (const layer of to) {
      const was = from.find((l) => l.id === layer.id);
      if (!was) changes.push({ change: 'added', ref: ref(layer) });
      else if (!sameBox(was, layer)) changes.push({ change: 'changed', ref: ref(layer) });
    }
    for (const layer of from) if (!to.some((l) => l.id === layer.id)) changes.push({ change: 'removed', ref: ref(layer) });
  };
  layers(before.layers, after.layers, { start: 0 });
  for (const scene of after.scenes) {
    const was = before.scenes.find((s) => s.id === scene.id);
    const ref: Reference = { kind: 'scene', label: scene.lines[0]?.text || scene.id, scene: scene.id, time: scene.start };
    if (!was) {
      changes.push({ change: 'added', ref });
      continue;
    }
    if (was.start !== scene.start || was.duration !== scene.duration) changes.push({ change: 'changed', ref });
    layers(was.layers, scene.layers, { id: scene.id, start: scene.start });
    for (const line of scene.lines) {
      const old = was.lines.find((l) => l.id === line.id);
      const lineRef: Reference = { kind: 'line', label: line.text, scene: scene.id, line: line.id, time: scene.start };
      if (!old) changes.push({ change: 'added', ref: lineRef });
      else if (old.text !== line.text) changes.push({ change: 'changed', ref: lineRef });
    }
    for (const line of was.lines)
      if (!scene.lines.some((l) => l.id === line.id))
        changes.push({ change: 'removed', ref: { kind: 'line', label: line.text, scene: scene.id, line: line.id } });
  }
  for (const scene of before.scenes)
    if (!after.scenes.some((s) => s.id === scene.id))
      changes.push({ change: 'removed', ref: { kind: 'scene', label: scene.lines[0]?.text || scene.id, scene: scene.id } });
  return changes;
}

/** A change summed up by kind: `+1 scene · ~2 layers · −1 line`. */
export function changeLine(changes: FilmChange[]): string {
  const sign = { added: '+', changed: '~', removed: '−' } as const;
  const parts: string[] = [];
  for (const change of ['added', 'changed', 'removed'] as const)
    for (const kind of ['scene', 'layer', 'line'] as const) {
      const n = changes.filter((c) => c.change === change && c.ref.kind === kind).length;
      if (n) parts.push(`${sign[change]}${n} ${kind}${n > 1 ? 's' : ''}`);
    }
  return parts.join(' · ');
}

/** The key by which the outline and the timeline know a scene, a layer or a line the agent just changed. */
export const changeKey = (ref: Pick<Reference, 'kind' | 'scene' | 'layer' | 'line'>) =>
  `${ref.kind}:${ref.scene ?? ''}:${ref.layer ?? ''}:${ref.line ?? ''}`;
