// The film's structure, on the playhead's rail: its own layers in a group of their own, then each scene as one row
// (a frame of it, its number, its first line, where it starts and how long it is) with its layers, topmost first,
// and the rest of its lines under it. The rail marks the scenes played, the one playing and how far into it the
// playhead is. The scene the playhead enters opens and the one it leaves closes, unless the person folded or opened
// it; while the film plays the list keeps the playing scene in view, unless the person moved the list in the last
// few seconds. A layer hovered here, on the timeline or on the picture is shown in all three (`hovered`).
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers, MessageSquare, Play, SquareStack } from 'lucide-react';
import type { Reference, SceneStills } from '../../shared/api';
import type { FilmInfo, LayerBox, SceneInfo } from '../../shared/preview';
import { timecode } from './preview';
import { changeKey } from './activity';

export const sceneTitle = (scene: SceneInfo): string => scene.lines[0]?.text || scene.id.replace(/[-_]/g, ' ');
export const sameSelection = (a: Reference | null, b: Reference): boolean =>
  !!a && a.kind === b.kind && a.scene === b.scene && a.layer === b.layer && a.line === b.line;

/** A layer under the pointer, in a scene or the film's own (no scene). */
export type Hovered = { layer: string; scene?: string } | null;
export const sameHovered = (a: Hovered, layer: string, scene?: string): boolean => !!a && a.layer === layer && a.scene === scene;

/** Where a scene stands against the playhead, and how far into it the playhead is (0 to 1). */
export function sceneProgress(scene: SceneInfo, t: number): { state: 'played' | 'playing' | 'next'; done: number } {
  if (t >= scene.start + scene.duration) return { state: 'played', done: 1 };
  if (t < scene.start) return { state: 'next', done: 0 };
  return { state: 'playing', done: (t - scene.start) / scene.duration };
}

export function Outline({
  film,
  selected,
  fresh,
  t,
  playing,
  stills,
  hovered,
  onHover,
  onSelect,
  onReference,
  onPlay,
}: {
  film: FilmInfo | null;
  selected: Reference | null;
  /** What the agent's last turn changed (changeKey), lit for a moment. */
  fresh: Set<string>;
  t: number;
  playing: boolean;
  /** Each scene's frames, for its row's picture; null until they are made. */
  stills: SceneStills | null;
  hovered: Hovered;
  onHover(hovered: Hovered): void;
  onSelect(ref: Reference): void;
  onReference(ref: Reference): void;
  /** Plays a span, with one layer alone when `solo` names it. */
  onPlay(start: number, end: number, solo?: string): void;
}) {
  const current = film?.scenes.find((s) => t >= s.start && t < s.start + s.duration)?.id;
  const sections = useRef(new Map<string, HTMLElement>());
  /** When the person last moved the list, which the playhead leaves alone for a while after. */
  const touched = useRef(0);
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : []));
  /** Scenes the person opened or folded themselves, which the playhead no longer opens or folds. */
  const pinned = useRef(new Set<string>());
  const left = useRef(current);
  useEffect(() => {
    const was = left.current;
    left.current = current;
    if (was === current) return;
    setOpen((now) => {
      const next = new Set(now);
      if (was && !pinned.current.has(was)) next.delete(was);
      if (current && !pinned.current.has(current)) next.add(current);
      return next;
    });
  }, [current]);
  // What is selected elsewhere (the stage, the timeline) shows here with its scene open.
  useEffect(() => {
    const scene = selected?.scene;
    if (scene) setOpen((now) => (now.has(scene) ? now : new Set(now).add(scene)));
  }, [selected?.scene]);
  // A layer whose scene folds is no longer under the pointer, though the pointer has not moved.
  useEffect(() => {
    if (hovered?.scene && !open.has(hovered.scene)) onHover(null);
  }, [open, hovered?.scene]);
  useEffect(() => {
    if (!playing || !current || Date.now() - touched.current < 4000) return;
    sections.current.get(current)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current, playing]);
  if (!film)
    return (
      <div className="body">
        <p className="note">Your film’s scenes and layers will appear here once the preview is ready.</p>
      </div>
    );

  const fold = (id: string) => {
    pinned.current.add(id);
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const foldAll = () => {
    for (const scene of film.scenes) pinned.current.add(scene.id);
    setOpen(open.size ? new Set() : new Set(film.scenes.map((s) => s.id)));
  };
  const ask = (ref: Reference) => (
    <button
      type="button"
      className="icon-button"
      aria-label={`Ask about ${ref.label}`}
      data-tip="Add to your message"
      onClick={() => {
        onSelect(ref);
        onReference(ref);
      }}
    >
      <MessageSquare size={13} />
    </button>
  );
  const classes = (ref: Reference, extra = '') =>
    `outline-row${extra}${sameSelection(selected, ref) ? ' selected' : ''}${fresh.has(changeKey(ref)) ? ' fresh' : ''}`;
  const layerRow = (layer: LayerBox, scene?: SceneInfo) => {
    const ref: Reference = scene
      ? { kind: 'layer', label: layer.id, scene: scene.id, layer: layer.id, time: scene.start + Math.min(0.5, scene.duration / 2) }
      : { kind: 'layer', label: layer.id, layer: layer.id, time: 0 };
    return (
      <div
        key={layer.id}
        className={classes(ref, sameHovered(hovered, layer.id, scene?.id) ? ' hovered' : '')}
        onPointerEnter={() => onHover({ layer: layer.id, scene: scene?.id })}
      >
        <button
          className="outline-pick"
          aria-pressed={sameSelection(selected, ref)}
          title={`${layer.id} · ${layer.w} × ${layer.h} at (${layer.x}, ${layer.y}) · z ${layer.z}`}
          onClick={() => onSelect(ref)}
        >
          <Layers size={13} />
          <span className="outline-layer">{layer.id}</span>
        </button>
        <span className="row-actions">
          {scene && (
            <button
              type="button"
              className="icon-button"
              aria-label={`Play ${layer.id} alone`}
              data-tip="Play this layer alone"
              onClick={() => onPlay(scene.start, scene.start + scene.duration, layer.id)}
            >
              <SquareStack size={13} />
            </button>
          )}
          {ask(ref)}
        </span>
      </div>
    );
  };

  return (
    <div
      className="body outline-panel"
      onWheel={() => (touched.current = Date.now())}
      onPointerDown={() => (touched.current = Date.now())}
      onPointerLeave={() => onHover(null)}
    >
      <div className="outline-tools">
        <span>
          {film.scenes.length} {film.scenes.length === 1 ? 'scene' : 'scenes'} · {film.seconds.toFixed(1)} s
        </span>
        {film.scenes.length > 0 && (
          <button type="button" className="quiet" onClick={foldAll}>
            {open.size ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      {film.layers.length > 0 && (
        <details className="outline-global">
          <summary>
            <Layers size={13} />
            Across the film · {film.layers.length} {film.layers.length === 1 ? 'layer' : 'layers'}
          </summary>
          {[...film.layers].sort((a, b) => b.z - a.z).map((layer) => layerRow(layer))}
        </details>
      )}
      {film.scenes.map((scene, index) => {
        const ref: Reference = { kind: 'scene', label: sceneTitle(scene), scene: scene.id, time: scene.start };
        const { state, done } = sceneProgress(scene, t);
        const frames = stills?.[scene.id];
        const isOpen = open.has(scene.id);
        return (
          <section
            key={scene.id}
            className={`outline-scene ${state}${isOpen ? '' : ' closed'}`}
            ref={(element) => {
              if (element) sections.current.set(scene.id, element);
              else sections.current.delete(scene.id);
            }}
          >
            <span className="outline-rail" aria-hidden="true">
              <span style={{ height: `${done * 100}%` }} />
            </span>
            <span className="outline-node" aria-hidden="true" />
            <div className={classes(ref, ' outline-scene-row')} onPointerEnter={() => onHover(null)}>
              <button className="outline-pick" aria-pressed={sameSelection(selected, ref)} onClick={() => onSelect(ref)}>
                {frames?.length ? (
                  <img className="outline-thumb" src={frames[Math.floor(frames.length / 2)]} alt="" />
                ) : (
                  <span className="outline-thumb" aria-hidden="true" />
                )}
                <span>
                  <strong>{sceneTitle(scene)}</strong>
                  <small>
                    <b>{String(index + 1).padStart(2, '0')}</b> {timecode(scene.start)} · {scene.duration.toFixed(1)} s
                  </small>
                </span>
              </button>
              <span className="row-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Play ${sceneTitle(scene)}`}
                  data-tip="Play this scene"
                  onClick={() => onPlay(scene.start, scene.start + scene.duration)}
                >
                  <Play size={13} />
                </button>
                {ask(ref)}
              </span>
              <button
                type="button"
                className="icon-button outline-fold"
                aria-expanded={isOpen}
                aria-label={isOpen ? `Fold ${sceneTitle(scene)}` : `Open ${sceneTitle(scene)}`}
                onClick={() => fold(scene.id)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {isOpen && (
              <div className="outline-children">
                {[...scene.layers].sort((a, b) => b.z - a.z).map((layer) => layerRow(layer, scene))}
                {/* Its first line is its title: the rest are said under it. */}
                {scene.lines.slice(1).map((line) => {
                  const lineRef: Reference = { kind: 'line', label: line.text, scene: scene.id, line: line.id, time: scene.start };
                  return (
                    <div key={line.id} className={classes(lineRef, ' outline-line')} onPointerEnter={() => onHover(null)}>
                      <button className="outline-pick" aria-pressed={sameSelection(selected, lineRef)} onClick={() => onSelect(lineRef)}>
                        <q>{line.text}</q>
                      </button>
                      <span className="row-actions">{ask(lineRef)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
