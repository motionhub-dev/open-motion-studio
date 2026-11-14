// The film's preview: its page in a sandboxed frame on the oms-preview: scheme, driven by
// the preview bridge protocol (src/shared/preview.ts). usePlayer holds what the page reports
// (the film, the time, whether it plays) and what the person is doing with it (a tool to
// mark the picture, looping); Stage draws the frame, the marks over it and, along its foot,
// the controls that play it and point at it. A new build reloads the frame at the same time.

import {
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  Frame,
  Loader,
  Maximize,
  Minimize,
  Pause,
  Play,
  Repeat,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  SquareDashed,
  X,
} from 'lucide-react';
import { type PointerEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type BuildResult, MARK_NOTE, MAX_MARKS, type Mark, type Reference } from '../../shared/api';
import type { Box, FilmInfo, FromPreview, PickedElement, ToPreview } from '../../shared/preview';
import { type Hovered, sameHovered } from './outline';

export type Tool = 'pick' | 'region' | null;

/** `mm:ss.cc`, the clock every time in the Studio is shown in. */
export const timecode = (s: number) => {
  const whole = Math.max(0, s);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${(whole % 60).toFixed(2).padStart(5, '0')}`;
};

/** A mark shows on the picture while the playhead is this close to its moment. */
const NEAR = 0.25;

export interface Player {
  frame: RefObject<HTMLIFrameElement | null>;
  film: FilmInfo | null;
  t: number;
  playing: boolean;
  error: string | null;
  tool: Tool;
  setTool(tool: Tool): void;
  loop: boolean;
  setLoop(loop: boolean): void;
  /** Whether the film's sounds are off in the preview (never in an export). */
  muted: boolean;
  setMuted(muted: boolean): void;
  tell(message: ToPreview): void;
  toggle(): void;
  seek(t: number): void;
  /** Steps by frames (a negative count steps back). */
  step(frames: number): void;
  /** Plays from `start` to `end`, with one layer alone when `solo` names it. */
  playRange(start: number, end: number, solo?: string): void;
  /** The layer drawn alone, if any: playing, seeking or stepping draws them all again. */
  solo: string | null;
  endSolo(): void;
  /** Asks the page what is drawn at a point, or `depth` elements out from it; resolves with its answer. */
  pick(x: number, y: number, depth?: number): Promise<Picked>;
}

type Picked = Extract<FromPreview, { type: 'oms:picked' }>;
const NOTHING: Picked = { type: 'oms:picked', element: null, box: null, levels: 0 };

export function usePlayer(build: BuildResult | null): Player {
  const frame = useRef<HTMLIFrameElement>(null);
  const [film, setFilm] = useState<FilmInfo | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [solo, setSolo] = useState<string | null>(null);
  const picked = useRef<((message: Picked) => void) | null>(null);
  const now = useRef({ t: 0, playing: false, loop: false, muted: false, film: null as FilmInfo | null });
  now.current = { t, playing, loop, muted, film };

  const tell = (message: ToPreview) => frame.current?.contentWindow?.postMessage(message, '*');

  useEffect(() => {
    const onMessage = (event: MessageEvent<FromPreview>) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === 'oms:ready') {
        setFilm(message.film);
        setError(null);
        // a rebuilt film opens where the last one was, as loud as it was
        tell({ type: 'oms:seek', t: Math.min(now.current.t, message.film.seconds) });
        tell({ type: 'oms:mute', muted: now.current.muted });
      } else if (message?.type === 'oms:time') {
        const { film: shown, playing: was, loop: looping } = now.current;
        // A film that played to its end starts again when looping.
        if (looping && was && !message.playing && shown && message.t >= shown.seconds - 1 / shown.fps) {
          tell({ type: 'oms:seek', t: 0 });
          tell({ type: 'oms:play' });
        }
        setT(message.t);
        setPlaying(message.playing);
      } else if (message?.type === 'oms:error') {
        setError(message.message);
      } else if (message?.type === 'oms:picked') {
        picked.current?.(message);
        picked.current = null;
      }
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setError(null);
    setSolo(null);
    picked.current?.(NOTHING);
    picked.current = null;
  }, [build?.version]);

  const endSolo = () => {
    if (!solo) return;
    setSolo(null);
    tell({ type: 'oms:solo', layer: null });
  };
  const seek = (to: number) => {
    endSolo();
    tell({ type: 'oms:seek', t: Math.max(0, Math.min(film?.seconds ?? 0, to)) });
  };
  return {
    frame,
    film,
    t,
    playing,
    error,
    tool,
    setTool: (next) => {
      if (next && playing) tell({ type: 'oms:pause' });
      setTool(next);
    },
    loop,
    setLoop,
    muted,
    setMuted: (next) => {
      setMuted(next);
      tell({ type: 'oms:mute', muted: next });
    },
    tell,
    toggle: () => {
      if (!playing) endSolo();
      tell(playing ? { type: 'oms:pause' } : { type: 'oms:play' });
    },
    seek,
    solo,
    endSolo,
    playRange: (start, end, layer) => {
      setTool(null);
      setSolo(layer ?? null);
      tell({ type: 'oms:solo', layer: layer ?? null });
      tell({ type: 'oms:play-range', start, end });
    },
    step: (frames) => {
      if (!film) return;
      if (playing) tell({ type: 'oms:pause' });
      seek(Math.round(t * film.fps + frames) / film.fps);
    },
    pick: (x, y, depth = 0) =>
      new Promise((done) => {
        picked.current?.(NOTHING);
        const timer = setTimeout(() => {
          if (picked.current === resolve) {
            picked.current = null;
            done(NOTHING);
          }
        }, 1500);
        const resolve = (message: Picked) => {
          clearTimeout(timer);
          done(message);
        };
        picked.current = resolve;
        tell({ type: 'oms:pick', x, y, depth });
      }),
  };
}

/** Where the frame is drawn in a stage of this size: contained and centred, as every page draws it. */
function frameIn(stage: { width: number; height: number }, film: FilmInfo) {
  const scale = Math.min(stage.width / film.width, stage.height / film.height);
  const width = film.width * scale;
  const height = film.height * scale;
  return { left: (stage.width - width) / 2, top: (stage.height - height) / 2, width, height };
}

/** The room the page leaves around the frame, so it sits on the ink with its shadow. */
const INSET = 16;

/** The gap between a mark and the box that asks about it, and the least room it keeps from the stage's edge, in pixels. */
const GAP = 8;

/**
 * Where a box of `w` × `h` goes beside a mark (all in pixels of a stage `W` × `H`): below it, else above, to its right,
 * to its left, the first that fits; where none does, over the mark's top left, kept inside the stage.
 */
export function askPlace(mark: { left: number; top: number; width: number; height: number }, w: number, h: number, W: number, H: number) {
  const clampX = (left: number) => Math.max(GAP, Math.min(left, W - w - GAP));
  const clampY = (top: number) => Math.max(GAP, Math.min(top, H - h - GAP));
  const bottom = mark.top + mark.height;
  const right = mark.left + mark.width;
  if (bottom + GAP + h <= H - GAP) return { left: clampX(mark.left), top: bottom + GAP };
  if (mark.top - GAP - h >= GAP) return { left: clampX(mark.left), top: mark.top - GAP - h };
  if (right + GAP + w <= W - GAP) return { left: right + GAP, top: clampY(mark.top) };
  if (mark.left - GAP - w >= GAP) return { left: mark.left - GAP - w, top: clampY(mark.top) };
  return { left: clampX(mark.left + GAP), top: clampY(mark.top + GAP) };
}

/**
 * A mark being made and not yet added: its moment and box, and for a picked element how many steps out from the
 * innermost element it is, how many there are, and the point it was picked at.
 */
type Draft = { t: number; box: Box; element: PickedElement | null; picked?: { depth: number; levels: number; x: number; y: number } };

/** What a picked element is called: its words, else the last step of its path. */
export const elementName = (element: PickedElement) =>
  element.text ? `“${element.text.slice(0, 28)}”` : (element.path.split(' > ').pop() ?? element.path);

export function Stage({
  player,
  build,
  marks,
  lit,
  onMark,
  selected,
  hovered = null,
  working,
  onFix,
  guides,
  onGuides,
  disabled = false,
  column = 2,
}: {
  player: Player;
  build: BuildResult | null;
  marks: Mark[];
  /** The mark whose row in the composer is in hand, drawn lit at its moment. */
  lit: number | null;
  onMark(mark: Mark): void;
  selected: Reference | null;
  /** The layer under the pointer in the outline or on the timeline, drawn as its declared box. */
  hovered?: Hovered;
  /** Whether the agent is working on the film, which the stage says over its corner. */
  working: boolean;
  /** Hands an error on the stage to the agent, as an issue for the next message. */
  onFix(label: string, detail: string): void;
  /** Whether the action-safe (90%) and title-safe (80%) guides are drawn over the frame. */
  guides: boolean;
  onGuides(): void;
  disabled?: boolean;
  column?: number;
}) {
  const stage = useRef<HTMLDivElement>(null);
  /** The stage with its controls, which fills the screen in full screen. */
  const root = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  // Esc leaves full screen, as in a browser (Electron leaves it to the page), once no mark is being asked about.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.mark-ask')) void document.exitFullscreen().catch((e: unknown) => console.error('Leaving full screen failed:', e));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [fullscreen]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState('');
  const ask = useRef<HTMLDivElement>(null);
  const askField = useRef<HTMLTextAreaElement>(null);
  const [askAt, setAskAt] = useState<{ left: number; top: number } | null>(null);
  const { film, t } = player;
  const tool = disabled ? null : player.tool;
  const [lastGood, setLastGood] = useState<BuildResult | null>(null);
  if (build?.ok && build !== lastGood) setLastGood(build);
  const shownBuild = build?.ok ? build : lastGood;

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const r = element.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A mark half made belongs to the build and the tool it was made with.
  useEffect(() => setDraft(null), [build?.version, tool]);

  const inner = size && { width: Math.max(0, size.width - 2 * INSET), height: Math.max(0, size.height - 2 * INSET) };
  const box = inner && film ? frameIn(inner, film) : null;
  const pickContext = useRef({ version: build?.version, tool });
  pickContext.current = { version: build?.version, tool };
  useEffect(
    () => () => {
      pickContext.current = { version: undefined, tool: null };
    },
    [],
  );
  const full = marks.length >= MAX_MARKS;
  const selectedScene = film?.scenes.find((s) => s.id === selected?.scene);
  const selectedLayer = selected?.kind === 'layer' ? (selectedScene?.layers ?? film?.layers)?.find((l) => l.id === selected.layer) : null;
  const selectionVisible = !selectedScene || (t >= selectedScene.start && t < selectedScene.start + selectedScene.duration);
  // A hovered layer is drawn while its scene is the one on screen (a film's own layer, always).
  const hoveredScene = hovered?.scene ? film?.scenes.find((s) => s.id === hovered.scene) : undefined;
  const hoveredOnScreen = !hoveredScene || (t >= hoveredScene.start && t < hoveredScene.start + hoveredScene.duration);
  const hoveredLayer = hovered && hoveredOnScreen ? (hoveredScene ? hoveredScene.layers : film?.layers)?.find((l) => l.id === hovered.layer) : undefined;

  const place = (b: Box) =>
    box && {
      left: INSET + box.left + b.x * box.width,
      top: INSET + box.top + b.y * box.height,
      width: b.w * box.width,
      height: b.h * box.height,
    };

  // The box that asks sits beside the mark, measured once it is drawn.
  useLayoutEffect(() => {
    const mark = draft && place(draft.box);
    if (!mark || !ask.current || !size) return setAskAt(null);
    setAskAt(askPlace(mark, ask.current.offsetWidth, ask.current.offsetHeight, size.width, size.height));
  }, [draft, size, box?.width]);
  // Only once it is placed, since a box still hidden cannot take the cursor.
  useEffect(() => {
    if (askAt) askField.current?.focus();
  }, [askAt, draft]);
  // Esc lets the mark go wherever the cursor is; the workspace's own keys wait while the box is open.
  useEffect(() => {
    if (!draft) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDraft(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [draft]);

  /** A point on the stage as fractions of the frame, or null outside it. */
  function point(event: PointerEvent) {
    if (!box || !stage.current) return null;
    const r = stage.current.getBoundingClientRect();
    const x = (event.clientX - r.left - INSET - box.left) / box.width;
    const y = (event.clientY - r.top - INSET - box.top) / box.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  }

  /** Asks the page what is drawn at a point, `depth` steps out from the innermost element, and makes it the draft. */
  async function pickAt(at: number, x: number, y: number, depth: number) {
    const version = build?.version;
    const message = await player.pick(x, y, depth);
    if (pickContext.current.version !== version || pickContext.current.tool !== 'pick') return;
    // Where nothing is drawn, the point itself is marked, as a small region.
    const fallback: Box = { x: Math.min(0.96, Math.max(0, x - 0.02)), y: Math.min(0.96, Math.max(0, y - 0.02)), w: 0.04, h: 0.04 };
    setDraft({
      t: at,
      box: message.box ?? fallback,
      element: message.element,
      picked: message.element ? { depth: Math.min(depth, message.levels - 1), levels: message.levels, x, y } : undefined,
    });
  }

  function down(event: PointerEvent) {
    const p = point(event);
    if (!p || full) return;
    if (tool === 'pick') {
      setNote('');
      void pickAt(t, p.x, p.y, 0);
    } else if (tool === 'region') {
      (event.target as Element).setPointerCapture(event.pointerId);
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  }

  function move(event: PointerEvent) {
    if (!drag || !box || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setDrag({
      ...drag,
      x1: clamp((event.clientX - r.left - INSET - box.left) / box.width),
      y1: clamp((event.clientY - r.top - INSET - box.top) / box.height),
    });
  }

  function up() {
    if (!drag) return;
    const region = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      w: Math.abs(drag.x1 - drag.x0),
      h: Math.abs(drag.y1 - drag.y0),
    };
    setDrag(null);
    if (region.w > 0.01 && region.h > 0.01) {
      setNote('');
      setDraft({ t, box: region, element: null });
    }
  }

  function add() {
    if (!draft || full) return;
    onMark({ t: draft.t, box: draft.box, element: draft.element, note: note.trim().slice(0, MARK_NOTE) });
    setDraft(null);
    setNote('');
  }

  function step(by: 1 | -1) {
    const picked = draft?.picked;
    if (draft && picked) void pickAt(draft.t, picked.x, picked.y, picked.depth + by);
  }

  return (
    <div className="stage" ref={root} style={{ gridColumn: column, gridRow: 1 }}>
      <div className="picture" ref={stage} style={{ padding: INSET }}>
        {/* The picture asks for the film's own shape, so the stage is no taller than its frame where there is room. */}
        <div className="fit" style={{ aspectRatio: film ? `${film.width} / ${film.height}` : '16 / 9' }} />
        {box && film && <div className="plate" style={place({ x: 0, y: 0, w: 1, h: 1 }) ?? undefined} />}
        {shownBuild?.ok && (
          <iframe
            key={shownBuild.version}
            ref={player.frame}
            title="Film preview"
            sandbox="allow-scripts"
            src={`oms-preview://film/?v=${shownBuild.version}`}
            style={{ inset: INSET, width: `calc(100% - ${2 * INSET}px)`, height: `calc(100% - ${2 * INSET}px)` }}
          />
        )}
        {film && box && (
          <div
            className={`marks${tool ? ` tool-${tool}` : ''}`}
            onPointerDown={tool && !draft ? down : undefined}
            onPointerMove={tool ? move : undefined}
            onPointerUp={tool ? up : undefined}
          >
            {film && selectedLayer && selectionVisible && (
              <div
                className="selection-box"
                style={
                  place({
                    x: selectedLayer.x / film.width,
                    y: selectedLayer.y / film.height,
                    w: selectedLayer.w / film.width,
                    h: selectedLayer.h / film.height,
                  }) ?? undefined
                }
              >
                <span>{selected?.label} · declared bounds</span>
              </div>
            )}
            {film && hoveredLayer && !sameHovered(hovered, selectedLayer?.id ?? '', selected?.scene) && (
            <div
              className="selection-box hovered"
              style={place({ x: hoveredLayer.x / film.width, y: hoveredLayer.y / film.height, w: hoveredLayer.w / film.width, h: hoveredLayer.h / film.height }) ?? undefined}
            >
              <span>{hoveredLayer.id}</span>
            </div>
          )}
          {guides && (
              <>
                <div className="safe-guide" style={place({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }) ?? undefined} />
                <div className="safe-guide title" style={place({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }) ?? undefined} />
              </>
            )}
            {marks.map((mark, i) =>
              mark.end === undefined && Math.abs(mark.t - t) <= NEAR ? (
                <div key={i} className={`mark${lit === i ? ' lit' : ''}`} style={place(mark.box) ?? undefined}>
                  <span className="number">{i + 1}</span>
                </div>
              ) : null,
            )}
            {drag && (
              <div
                className="mark drawing"
                style={
                  place({
                    x: Math.min(drag.x0, drag.x1),
                    y: Math.min(drag.y0, drag.y1),
                    w: Math.abs(drag.x1 - drag.x0),
                    h: Math.abs(drag.y1 - drag.y0),
                  }) ?? undefined
                }
              />
            )}
            {draft && (
              <div className="mark drawing" style={place(draft.box) ?? undefined}>
                <span className="number">{marks.length + 1}</span>
              </div>
            )}
          </div>
        )}
        {draft && (
          <div
            ref={ask}
            className="mark-ask"
            role="dialog"
            aria-label={`Mark ${marks.length + 1}`}
            style={askAt ?? { left: 0, top: 0, visibility: 'hidden' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={askField}
              value={note}
              rows={2}
              maxLength={MARK_NOTE}
              aria-label="What should change here"
              placeholder="What should change here? (optional)"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setDraft(null);
                } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <span className="found">
              {draft.element ? `${elementName(draft.element)}${draft.element.layer ? ` · ${draft.element.layer}` : ''}` : 'A region of the frame'} ·{' '}
              {timecode(draft.t)}
            </span>
            <div className="ask-actions">
              {draft.picked && draft.picked.levels > 1 && (
                <>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="The element around it"
                    data-tip="The element around it"
                    disabled={draft.picked.depth >= draft.picked.levels - 1}
                    onClick={() => step(1)}
                  >
                    <ChevronsUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="The element inside"
                    data-tip="The element inside"
                    disabled={draft.picked.depth === 0}
                    onClick={() => step(-1)}
                  >
                    <ChevronsDown size={15} />
                  </button>
                </>
              )}
              <span className="spacer" />
              <button type="button" className="button ghost" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className="button primary" disabled={full} onClick={add}>
                Add mark
              </button>
            </div>
          </div>
        )}
        {player.solo && (
          <span className="stage-solo" role="status">
            Solo · {player.solo}
            <button type="button" className="icon-button" aria-label="Draw every layer again" data-tip="Draw every layer" onClick={player.endSolo}>
              <X size={12} />
            </button>
          </span>
        )}
        {working && (
          <span className="stage-working" role="status">
            <Loader size={13} className="spin" />
            The agent is working on the film
          </span>
        )}
        {!build && <p className="waiting">Building the film…</p>}
        {build && !build.ok && (
          <div className="callout build-error" role="alert">
            <strong>{lastGood ? 'Showing the last successful preview' : 'The film does not build'}</strong>
            <pre>{build.errors.join('\n')}</pre>
            {!working && (
              <button type="button" className="button" onClick={() => onFix('The film does not build', build.errors.join('\n'))}>
                Ask the agent to fix it
              </button>
            )}
          </div>
        )}
        {build?.ok && player.error && (
          <div className="callout build-error" role="alert">
            <strong>The film stopped drawing</strong>
            <pre>{player.error}</pre>
            {!working && (
              <button type="button" className="button" onClick={() => onFix('The film stopped drawing', player.error!)}>
                Ask the agent to fix it
              </button>
            )}
          </div>
        )}
      </div>
      <Controls
        player={player}
        tool={tool}
        full={full}
        disabled={disabled}
        guides={guides}
        onGuides={onGuides}
        fullscreen={fullscreen}
        onFullscreen={() => {
          const done = fullscreen ? document.exitFullscreen() : root.current?.requestFullscreen();
          // Refused only when the window cannot go full screen; the stage stays as it was, and the reason is logged.
          done?.catch((e: unknown) => console.error('Full screen was refused:', e));
        }}
      />
    </div>
  );
}

/**
 * The stage's foot: play and step on the left; the tools that point at the picture, the film's size and full screen
 * on the right.
 */
function Controls({
  player,
  tool,
  full,
  disabled,
  guides,
  onGuides,
  fullscreen,
  onFullscreen,
}: {
  player: Player;
  tool: Tool;
  full: boolean;
  disabled: boolean;
  guides: boolean;
  onGuides(): void;
  fullscreen: boolean;
  onFullscreen(): void;
}) {
  const { film, t, playing } = player;
  const fullTip = `A message carries at most ${MAX_MARKS} marks`;
  return (
    <div className="stage-bar">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous frame"
        data-tip="Previous frame"
        data-key="←"
        disabled={!film}
        onClick={() => player.step(-1)}
      >
        <SkipBack size={15} />
      </button>
      <button
        type="button"
        className="play"
        aria-label={playing ? 'Pause' : 'Play'}
        data-tip={playing ? 'Pause' : 'Play'}
        data-key="Space"
        disabled={!film}
        onClick={player.toggle}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Next frame"
        data-tip="Next frame"
        data-key="→"
        disabled={!film}
        onClick={() => player.step(1)}
      >
        <SkipForward size={15} />
      </button>
      <span className="timecode" aria-label="Time">
        {timecode(t)} <span>/ {timecode(film?.seconds ?? 0)}</span>
      </span>
      <button
        type="button"
        className="icon-button"
        aria-pressed={player.loop}
        aria-label="Loop"
        data-tip="Loop"
        disabled={!film}
        onClick={() => player.setLoop(!player.loop)}
        style={{ marginLeft: 6 }}
      >
        <Repeat size={15} />
      </button>
      {film && film.sounds.length > 0 && (
        <button
          type="button"
          className="icon-button"
          aria-pressed={player.muted}
          aria-label={player.muted ? 'Sound off' : 'Sound on'}
          data-tip={player.muted ? 'Turn the sound on' : 'Turn the sound off'}
          onClick={() => player.setMuted(!player.muted)}
        >
          {player.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      )}
      <span className="spacer" />
      <span className="pointing" role="group" aria-label="Point at the picture">
        <button
          type="button"
          aria-pressed={tool === 'pick'}
          aria-label="Pick an element"
          data-tip={full ? fullTip : 'Pick an element'}
          data-key={full ? undefined : 'C'}
          disabled={!film || full || disabled}
          onClick={() => player.setTool(tool === 'pick' ? null : 'pick')}
        >
          <Crosshair size={14} />
          <span>Pick</span>
        </button>
        <button
          type="button"
          aria-pressed={tool === 'region'}
          aria-label="Mark a region"
          data-tip={full ? fullTip : 'Mark a region'}
          data-key={full ? undefined : 'C'}
          disabled={!film || full || disabled}
          onClick={() => player.setTool(tool === 'region' ? null : 'region')}
        >
          <SquareDashed size={14} />
          <span>Region</span>
        </button>
        <button
          type="button"
          aria-pressed={guides}
          aria-label="Safe-area guides"
          data-tip="Safe-area guides: action 90%, titles 80%"
          data-key="G"
          disabled={!film}
          onClick={onGuides}
        >
          <Frame size={14} />
          <span>Guides</span>
        </button>
      </span>
      {film && (
        <span className="spec">
          {film.width}×{film.height} · {Math.round(film.fps * 100) / 100} fps
        </span>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
        data-tip={fullscreen ? 'Leave full screen' : 'Full screen'}
        data-key={fullscreen ? 'Esc' : undefined}
        onClick={onFullscreen}
      >
        {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
      </button>
    </div>
  );
}
