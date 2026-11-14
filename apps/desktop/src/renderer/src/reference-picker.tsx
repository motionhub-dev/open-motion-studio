// The composer's @ picker: what the next message can point at, the film's scenes, layers and lines and the project's
// assets and motions, in groups, narrowed by what is typed after the @. A pick joins the message's tray.

import { useEffect, useState } from 'react';
import type { Asset, ProjectMotion, Reference } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { sceneTitle } from './outline';
import { timecode } from './preview';
import { reason } from './reason';

export type PickGroup = 'Scenes' | 'Layers' | 'Lines' | 'Assets' | 'Motions';

/** One thing the picker offers: the reference it adds, and what it is matched and shown by. */
export interface Pickable {
  group: PickGroup;
  ref: Reference;
  /** Its words for matching and showing: a scene's title, a layer's or motion's name, a line's text, a file's name. */
  label: string;
  /** Where it is, shown beside it: a scene's name, a file's path. */
  where?: string;
}

/** Everything the next message can point at, in the picker's order. */
export function pickables(film: FilmInfo | null, assets: Asset[], motions: ProjectMotion[]): Pickable[] {
  const picks: Pickable[] = [];
  for (const scene of film?.scenes ?? []) {
    picks.push({ group: 'Scenes', label: sceneTitle(scene), where: timecode(scene.start), ref: { kind: 'scene', label: sceneTitle(scene), scene: scene.id, time: scene.start } });
  }
  for (const layer of film?.layers ?? []) {
    picks.push({ group: 'Layers', label: layer.id, where: 'the whole film', ref: { kind: 'layer', label: layer.id, layer: layer.id, time: 0 } });
  }
  for (const scene of film?.scenes ?? []) {
    const time = scene.start + Math.min(0.5, scene.duration / 2);
    for (const layer of scene.layers) {
      picks.push({ group: 'Layers', label: layer.id, where: sceneTitle(scene), ref: { kind: 'layer', label: layer.id, scene: scene.id, layer: layer.id, time } });
    }
  }
  for (const scene of film?.scenes ?? []) {
    for (const line of scene.lines) {
      picks.push({ group: 'Lines', label: line.text, where: sceneTitle(scene), ref: { kind: 'line', label: line.text, scene: scene.id, line: line.id, time: scene.start } });
    }
  }
  for (const asset of assets) {
    picks.push({
      group: 'Assets',
      label: asset.name,
      where: asset.path,
      ref: { kind: 'asset', label: asset.name, path: asset.path, detail: `Use this local ${asset.kind}: ${asset.path}` },
    });
  }
  for (const motion of motions) {
    picks.push({
      group: 'Motions',
      label: motion.name,
      where: motion.id,
      ref: { kind: 'motion', label: motion.name, path: motion.path, detail: `The project's motion ${motion.id}, in ${motion.path}: ${motion.line}` },
    });
  }
  return picks;
}

/** How many of each group the picker shows while nothing narrows it. */
const PER_GROUP = 5;

/**
 * The picks that match what was typed after the @: every word of it found in a pick's words or where it is, those
 * whose words start with it first, in their groups' order. With nothing typed, the first few of each group.
 */
export function matchPicks(picks: Pickable[], query: string): Pickable[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    const seen = new Map<PickGroup, number>();
    return picks.filter((p) => {
      const n = seen.get(p.group) ?? 0;
      seen.set(p.group, n + 1);
      return n < PER_GROUP;
    });
  }
  const order: PickGroup[] = ['Scenes', 'Layers', 'Lines', 'Assets', 'Motions'];
  return picks
    .map((pick, at) => {
      const text = `${pick.label} ${pick.where ?? ''}`.toLowerCase();
      return words.every((w) => text.includes(w)) ? { pick, at, starts: pick.label.toLowerCase().startsWith(words[0]!) } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => order.indexOf(a.pick.group) - order.indexOf(b.pick.group) || Number(b.starts) - Number(a.starts) || a.at - b.at)
    .map((m) => m.pick)
    .slice(0, 30);
}

/** What the person is typing after an @ just before the caret, or null when the caret is not in one. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  return match ? { start: caret - match[2]!.length - 1, query: match[2]! } : null;
}

/** The picker over the composer: its matches in groups, the one in hand lit; the composer's keys move and pick. */
export function ReferencePicker({
  matches,
  active,
  loading,
  error,
  onPick,
  onHover,
}: {
  matches: Pickable[];
  active: number;
  loading: boolean;
  error: string | null;
  onPick(pick: Pickable): void;
  onHover(index: number): void;
}) {
  return (
    <div className="reference-picker" role="listbox" aria-label="Point the message at">
      {matches.map((pick, i) => (
        <div key={`${pick.group}:${i}`} role="presentation">
          {(i === 0 || matches[i - 1]!.group !== pick.group) && <div className="label picker-group">{pick.group}</div>}
          <button
            type="button"
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : undefined}
            // The composer keeps the focus, so the caret and what was typed stay.
            onPointerDown={(e) => e.preventDefault()}
            onPointerEnter={() => onHover(i)}
            onClick={() => onPick(pick)}
          >
            <span className="picker-label">{pick.label}</span>
            {pick.where && <small className="mono">{pick.where}</small>}
          </button>
        </div>
      ))}
      {!matches.length && <p className="note">{loading ? 'Looking through the project…' : error ?? 'Nothing here by that name.'}</p>}
      <p className="hint picker-keys">↑↓ to move · Enter to add · Esc to close</p>
    </div>
  );
}

/** The project's assets and motions, asked for while the picker is open. */
export function useProjectFiles(open: boolean): { assets: Asset[]; motions: ProjectMotion[]; loading: boolean; error: string | null } {
  const [files, setFiles] = useState<{ assets: Asset[]; motions: ProjectMotion[]; error: string | null } | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([window.studio.projectAssets(), window.studio.projectMotions()]).then(
      ([assets, motions]) => live && setFiles({ assets, motions, error: null }),
      (e) => live && setFiles({ assets: [], motions: [], error: reason(e) }),
    );
    return () => {
      live = false;
    };
  }, [open]);
  return { assets: files?.assets ?? [], motions: files?.motions ?? [], loading: open && !files, error: files?.error ?? null };
}
