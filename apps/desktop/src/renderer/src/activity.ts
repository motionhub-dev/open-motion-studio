// What the agent did, as the assistant panel tells it: the tool calls between its words folded into
// one line of plain words, what it is doing now, whether it keeps failing at the same thing, and how
// the film changed over a turn.

import type { ChatItem, Reference, Tokens, TurnUsage } from '../../shared/api';
import type { FilmInfo, LayerBox } from '../../shared/preview';

type Tool = Extract<ChatItem, { kind: 'tool' }>;

/**
 * Where a turn of the agent ended, as the panel keeps it while the project is open: the film as it was when the
 * person sent the message, the History entry of the files the turn wrote, and what the turn took.
 */
export interface TurnEnd {
  kind: 'turn';
  before: FilmInfo | null;
  checkpoint?: string;
  /** How many files the turn changed. */
  files?: number;
  outcome: 'done' | 'failed' | 'stopped';
  usage?: TurnUsage;
}

/** Every token a turn's account counts. */
export const allTokens = (t: Tokens): number => t.input + t.cacheRead + t.cacheWrite + t.output;

/** A count of tokens as the panel says it: `840`, `18.4k`, `1.2M`. */
export function tokenCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** What a turn's tokens were, part by part, for a tooltip. */
export function tokenParts(t: Tokens & { calls?: number; model?: string }): string {
  const n = (v: number) => Math.round(v).toLocaleString('en');
  return [
    t.model,
    t.calls ? `${t.calls} model ${t.calls === 1 ? 'call' : 'calls'}` : undefined,
    `Input ${n(t.input)}`,
    t.cacheRead ? `cached ${n(t.cacheRead)}` : undefined,
    t.cacheWrite ? `cache written ${n(t.cacheWrite)}` : undefined,
    `output ${n(t.output)}${t.reasoning ? ` (reasoning ${n(t.reasoning)})` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** How long a turn took, as the panel says it: `Worked for 8s`, `Worked for 1m 12s`. */
export function workedFor(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `Worked for ${minutes ? `${minutes}m ${whole % 60}s` : `${whole}s`}`;
}

/** A row of the conversation in the panel: what the transcript holds, and where turns ended. */
export type Row = ChatItem | TurnEnd;

/** What the agent said before its last tool call of a turn: said while it worked, kept with the work. */
export interface Said {
  kind: 'said';
  text: string;
  index: number;
}

/** A step of a turn's work: a tool call, or what the agent said between them. */
export type Step = Tool | Said;

/**
 * The conversation as the panel draws it: the person's messages; each turn's work as one block (its tool calls, and
 * what the agent said before its last one); the agent's answer after; and each question the agent asked, its leave
 * asked, a notice and where the turn ended, each on its own.
 */
export type Block =
  | { kind: 'item'; item: Exclude<Row, Tool>; index: number }
  | { kind: 'work'; steps: Step[]; tools: Tool[] }
  | { kind: 'ask'; tool: Tool & { ask: NonNullable<Tool['ask']> }; index: number };

const isWork = (item: Row): item is Tool => item.kind === 'tool' && !item.ask;

export function blocks(items: Row[]): Block[] {
  const out: Block[] = [];
  const turn = (from: number, to: number) => {
    let last = -1;
    for (let i = from; i < to; i++) if (isWork(items[i]!)) last = i;
    let work: Extract<Block, { kind: 'work' }> | null = null;
    const take = (step: Step, tool?: Tool) => {
      if (!work) out.push((work = { kind: 'work', steps: [], tools: [] }));
      work.steps.push(step);
      if (tool) work.tools.push(tool);
    };
    for (let index = from; index < to; index++) {
      const item = items[index]!;
      if (item.kind === 'tool') {
        if (item.ask) out.push({ kind: 'ask', tool: { ...item, ask: item.ask }, index });
        else take(item, item);
      } else if (item.kind === 'assistant' && index < last) take({ kind: 'said', text: item.text, index });
      else out.push({ kind: 'item', item, index });
    }
  };
  let from = 0;
  items.forEach((item, index) => {
    if (item.kind === 'user' && index > from) {
      turn(from, index);
      from = index;
    }
  });
  turn(from, items.length);
  return out;
}

/** A path a tool call's summary names, for the calls that name one. */
const pathOf = (tool: Tool) => /^(?:Writing|Editing|Reading) (.+?)(?: and \d+ more)?$/.exec(tool.summary)?.[1];

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A turn's work in a few words: `read 2 files · edited 3 files · checked twice · looked at 6 frames · 1 failed`. */
export function turnLine(tools: Tool[]): string {
  const edited = new Set<string>();
  let read = 0;
  const counts = new Map<string, number>();
  for (const tool of tools) {
    if (tool.name === 'write_file' || tool.name === 'edit_file') edited.add(pathOf(tool) ?? tool.id);
    else if (tool.name === 'read_file' || tool.name === 'list_files') read++;
    else counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  }
  const parts = [
    read ? `read ${plural(read, 'file')}` : '',
    edited.size ? `edited ${plural(edited.size, 'file')}` : '',
    ...[...counts].map(([name, n]) =>
      name === 'check'
        ? `checked ${times(n)}`
        : name === 'still'
          ? `looked at ${plural(n, 'frame')}`
          : name === 'shell'
            ? `ran ${plural(n, 'command')}`
            : name === 'search_motions'
              ? 'searched motionhub'
              : name === 'use_motion'
                ? `took ${plural(n, 'motion')}`
                : name === 'web_search'
                  ? 'searched the web'
                  : name,
    ),
  ].filter(Boolean);
  const failed = tools.filter((t) => t.result && !t.result.ok).length;
  return [...parts, failed ? `${failed} failed` : ''].filter(Boolean).join(' · ');
}

/**
 * What a turn that ended at row `end` gave: its answer (what the agent said after its last tool call) and how its last
 * check of the film came out, if it checked.
 */
export function turnFacts(items: Row[], end: number): { answer: string; check?: boolean } {
  let from = end;
  while (from > 0 && items[from - 1]!.kind !== 'user') from--;
  let last = from - 1;
  for (let i = from; i < end; i++) if (isWork(items[i]!)) last = i;
  const answer = items
    .slice(last + 1, end)
    .flatMap((item) => (item.kind === 'assistant' ? [item.text] : []))
    .join('\n\n');
  const check = items
    .slice(from, end)
    .filter((item): item is Tool => item.kind === 'tool' && item.name === 'check' && !!item.result)
    .pop();
  return { answer, ...(check ? { check: check.result!.ok } : {}) };
}

/** How a turn ended, from its end: done, stopped (a notice that is not an error) or failed. */
export const outcomeOf = (notice?: { error: boolean }): TurnEnd['outcome'] => (!notice ? 'done' : notice.error ? 'failed' : 'stopped');
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
