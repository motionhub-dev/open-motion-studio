// Read-only scene and layer timing. The declared spans explain structure, not pixel visibility.
// The marks lane shows the marks for the next message; dragging along it marks a stretch of the film.
// A film's sounds are bands on their own lane, each drawn as its waveform through its volume and fades.
// Ctrl (⌘) and the wheel zoom about the pointer; while the film plays the view follows the playhead
// a page at a time, until the person scrolls it themselves; a playhead out of view is a chip at the
// edge that brings it back. The check's issues sit on the ruler at their moments.
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react';
import { ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, Locate, Minus, Plus, Scan, TriangleAlert } from 'lucide-react';
import { MAX_MARKS, type FilmIssue, type Mark, type Reference, type SceneStills } from '../../shared/api';
import type { FilmInfo, LayerBox } from '../../shared/preview';
import { timecode } from './preview';
import { type Hovered, sameHovered, sceneTitle } from './outline';
import { changeKey } from './activity';
import { type FilmSound, soundGain, soundRegion, soundSpan } from '../../shared/sound';
import { reason } from './reason';

type Waveform = { seconds: number; peaks: number[] };

/** Each sound's file read for its waveform, by src: null while it is read, a string for why it could not be. */
function useWaveforms(sounds: FilmSound[]): Map<string, Waveform | string | null> {
  const [waves, setWaves] = useState(new Map<string, Waveform | string | null>());
  const srcs = [...new Set(sounds.map((sound) => sound.src))].join('\n');
  useEffect(() => {
    let live = true;
    for (const src of srcs ? srcs.split('\n') : []) {
      setWaves((now) => new Map(now).set(src, now.get(src) ?? null));
      window.studio.soundPeaks(src).then(
        (wave) => live && setWaves((now) => new Map(now).set(src, wave)),
        (error) => live && setWaves((now) => new Map(now).set(src, reason(error))),
      );
    }
    return () => {
      live = false;
    };
  }, [srcs]);
  return waves;
}

/** How many decibels below full scale a waveform shows, as an audio editor draws it: quiet sounds still have a shape. */
const FLOOR_DB = 48;

/**
 * A sound's waveform as `points` heights from 0 to 1 across its span, on a decibel scale: its file's peaks where it
 * plays them (its region again and again when looped), through its gain, so its volume and fades show in its shape.
 */
export function soundShape(sound: FilmSound, wave: Waveform, points: number): number[] {
  const span = soundSpan(sound, wave.seconds);
  const region = soundRegion(sound, wave.seconds);
  return Array.from({ length: points }, (_, i) => {
    const u = ((i + 0.5) / points) * span;
    const into = sound.trim + (sound.loop && region > 0 ? u % region : u);
    const peak = wave.peaks[Math.min(wave.peaks.length - 1, Math.floor(into * (wave.peaks.length / wave.seconds)))] ?? 0;
    const level = peak * soundGain(sound, span, u);
    return level > 0 ? Math.min(1, Math.max(0, 1 + (20 * Math.log10(level)) / FLOOR_DB)) : 0;
  });
}

/** The sounds laid on rows: each on the first row where it overlaps no other, so a hit never covers the bed under it. */
export function soundRows<T extends { start: number; end: number }>(spans: T[]): T[][] {
  const rows: T[][] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const row = rows.find((sounds) => sounds.every((other) => other.end <= span.start || other.start >= span.end));
    if (row) row.push(span);
    else rows.push([span]);
  }
  return rows;
}

const fileName = (src: string) => src.split('/').pop() ?? src;

function stepFor(seconds: number): number {
  return [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => seconds / step <= 10) ?? Math.ceil(seconds / 10);
}

/** How far the timeline zooms in: the whole film is 1×. */
export const ZOOM = { min: 1, max: 32 };

/** The zoom after one step of the wheel or a button, kept within ZOOM. */
export const zoomBy = (zoom: number, factor: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom * factor));

/**
 * Where the view must scroll so the time under the pointer stays under it: `x` is the pointer's distance from the
 * view's left edge, `width` the view's width, in pixels.
 */
export function scrollToKeep(scroll: number, x: number, width: number, from: number, to: number): number {
  const fraction = (scroll + x) / (width * from);
  return Math.max(0, fraction * width * to - x);
}

/** The width of one frame in a scene's strip, in pixels. */
export const TILE = 40;

/**
 * The frames a scene's strip of `width` pixels shows: as many as fit, each the scene's frame nearest its place in time.
 */
export function stripOf<T>(frames: T[], width: number): T[] {
  if (!frames.length) return [];
  const count = Math.max(1, Math.floor(width / TILE));
  return Array.from({ length: count }, (_, i) => frames[Math.min(frames.length - 1, Math.floor(((i + 0.5) / count) * frames.length))]!);
}

/** Folds the timeline to its head, or opens it again. */
export function Fold({ folded, onFold }: { folded: boolean; onFold(folded: boolean): void }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={folded ? 'Show the timeline' : 'Fold the timeline'}
      data-tip={folded ? 'Show the timeline' : 'Fold the timeline'}
      data-key="\"
      onClick={() => onFold(!folded)}
    >
      {folded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );
}

export function Timeline({
  film,
  t,
  playing,
  marks,
  lit,
  fresh,
  issues,
  onIssue,
  onRange,
  onSeek,
  selected,
  onSelect,
  onFold,
  stills,
  stillsError,
  hovered,
  onHover,
}: {
  film: FilmInfo;
  t: number;
  playing: boolean;
  marks: Mark[];
  lit: number | null;
  /** What the agent's last turn changed (changeKey), lit for a moment. */
  fresh: Set<string>;
  /** The last check's issues that have a moment, for the build on screen. */
  issues: FilmIssue[];
  /** Takes an issue to the assistant. */
  onIssue(issue: FilmIssue): void;
  onRange(start: number, end: number): void;
  onSeek(t: number): void;
  selected: Reference | null;
  onSelect(ref: Reference): void;
  /** Folds the timeline to its head. */
  onFold(folded: boolean): void;
  /** Each scene's frames, by scene id, drawn as a strip in its block; null until they are made. */
  stills: SceneStills | null;
  /** Why the frames could not be made, if they could not. */
  stillsError: string;
  /** The layer under the pointer here or in the outline, lit in both and drawn on the picture. */
  hovered: Hovered;
  onHover(hovered: Hovered): void;
}) {
  const [zoom, setZoom] = useState(1);
  /** The zoom as last asked for, ahead of the render, so wheel steps that come together add up. */
  const zoomNow = useRef(1);
  const [follow, setFollow] = useState(true);
  const tracks = useRef<HTMLDivElement>(null);
  /** The scroll a zoom about the pointer asks for, applied once the wider grid is laid out. */
  const pendingScroll = useRef<number | null>(null);
  /** Whether the last scroll was the view following the playhead, not the person. */
  const following = useRef(false);
  const [view, setView] = useState({ left: 0, width: 1 });
  /** The moment under the pointer on the ruler, which it names with its scene. */
  const [hover, setHover] = useState<number | null>(null);
  /** A stretch being dragged out on the marks lane, in seconds. */
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const seconds = film.seconds || 1;
  const waves = useWaveforms(film.sounds);
  // Each sound where it plays: as long as its file makes it once read, and until then as long as it may play.
  const soundLanes = soundRows(
    film.sounds.flatMap((sound, index) => {
      const wave = waves.get(sound.src);
      const span = wave && typeof wave === 'object' ? soundSpan(sound, wave.seconds) : sound.until - sound.at;
      return span > 0 ? [{ sound, index, start: sound.at, end: sound.at + span }] : [];
    }),
  );
  const at = (s: number) => `${Math.min(100, Math.max(0, (s / seconds) * 100))}%`;
  const step = stepFor(seconds / zoom);
  const ticks = Array.from({ length: Math.ceil(seconds / step) }, (_, i) => i * step);
  const rows = new Map<string, { label: string; spans: { layer: LayerBox; start: number; duration: number; scene?: string }[] }>();
  for (const layer of film.layers) rows.set(`global:${layer.id}`, { label: layer.id, spans: [{ layer, start: 0, duration: seconds }] });
  for (const scene of film.scenes)
    for (const layer of scene.layers) {
      const key = `scene:${layer.id}`;
      if (!rows.has(key)) rows.set(key, { label: layer.id, spans: [] });
      rows.get(key)!.spans.push({ layer, start: scene.start, duration: scene.duration, scene: scene.id });
    }
  const seekAt = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(seconds, ((event.clientX - rect.left) / rect.width) * seconds)));
  };
  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(seconds, ((event.clientX - rect.left) / rect.width) * seconds));
  };
  const full = marks.length >= MAX_MARKS;
  const endRange = () => {
    if (!range) return;
    const [start, end] = range.from < range.to ? [range.from, range.to] : [range.to, range.from];
    setRange(null);
    // Shorter than a few frames is a click: it seeks.
    if (end - start >= 3 / film.fps) onRange(start, end);
    else onSeek(range.from);
  };

  /** Zooms to `next`, keeping the time `x` pixels into the view where it is (the view's middle by default). */
  const zoomTo = (next: number, x?: number) => {
    const el = tracks.current;
    const from = zoomNow.current;
    if (!el || next === from) return;
    const scroll = pendingScroll.current ?? el.scrollLeft;
    pendingScroll.current = scrollToKeep(scroll, x ?? el.clientWidth / 2, el.clientWidth, from, next);
    zoomNow.current = next;
    setZoom(next);
  };
  useLayoutEffect(() => {
    const el = tracks.current;
    if (el && pendingScroll.current !== null) {
      el.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
    if (el) setView({ left: el.scrollLeft, width: el.clientWidth });
  }, [zoom]);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const rect = event.currentTarget.getBoundingClientRect();
    zoomTo(zoomBy(zoomNow.current, event.deltaY < 0 ? 1.25 : 0.8), event.clientX - rect.left);
  };
  // React's wheel listener is passive, so the page would zoom too: Ctrl+wheel is taken here instead.
  useEffect(() => {
    const el = tracks.current;
    if (!el) return;
    const stop = (event: globalThis.WheelEvent) => (event.ctrlKey || event.metaKey) && event.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    const resized = new ResizeObserver(() => setView({ left: el.scrollLeft, width: el.clientWidth }));
    resized.observe(el);
    return () => {
      el.removeEventListener('wheel', stop);
      resized.disconnect();
    };
  }, []);

  // + and − zoom, Shift+Z fits the film (the workspace lists them; a field or a dialog keeps its keys).
  const keys = useRef({ zoomTo });
  keys.current = { zoomTo };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role=dialog]')) return;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const { zoomTo: to } = keys.current;
      if (event.key === '+' || event.key === '=') to(zoomBy(zoomNow.current, 1.25));
      else if (event.key === '-' || event.key === '_') to(zoomBy(zoomNow.current, 0.8));
      else if (event.key === 'Z' && event.shiftKey) to(ZOOM.min);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Where the playhead is in the grid, in pixels, and whether the view shows it.
  const grid = view.width * zoom;
  const playheadX = (Math.min(t, seconds) / seconds) * grid;
  const off = zoom > 1 ? (playheadX < view.left ? 'left' : playheadX > view.left + view.width ? 'right' : null) : null;
  const scrollTo = (left: number) => {
    const el = tracks.current;
    if (!el) return;
    following.current = true;
    el.scrollLeft = left;
  };
  // While the film plays, the view turns a page when the playhead nears its right edge.
  useEffect(() => {
    if (!playing || !follow || zoom === 1) return;
    if (playheadX > view.left + view.width * 0.92 || playheadX < view.left) scrollTo(playheadX - view.width * 0.08);
  }, [t, playing, follow, zoom]);

  return (
    <div className="timeline-wrap">
      <div className="timeline-options">
        <span className="eyebrow">Timeline</span>
        <span className="spacer" />
        <button
          className="icon-button"
          aria-pressed={follow}
          aria-label="Follow the playhead"
          data-tip={follow ? 'Following the playhead while it plays' : 'Follow the playhead while it plays'}
          onClick={() => setFollow(!follow)}
        >
          <Locate size={12} />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out timeline"
          data-tip="Zoom out"
          data-key="−"
          disabled={zoom === ZOOM.min}
          onClick={() => zoomTo(zoomBy(zoomNow.current, 0.5))}
        >
          <Minus size={12} />
        </button>
        <span className="mono" title="Ctrl and the wheel zoom about the pointer">
          {Math.round(zoom * 10) / 10}×
        </span>
        <button
          className="icon-button"
          aria-label="Zoom in timeline"
          data-tip="Zoom in"
          data-key="+"
          disabled={zoom === ZOOM.max}
          onClick={() => zoomTo(zoomBy(zoomNow.current, 2))}
        >
          <Plus size={12} />
        </button>
        <button className="icon-button" aria-label="Fit timeline" data-tip="Fit the whole film" data-key="Shift Z" onClick={() => zoomTo(ZOOM.min)}>
          <Scan size={12} />
        </button>
        <Fold folded={false} onFold={onFold} />
      </div>
      <div className="timeline" aria-label="Timeline">
        <div className="timeline-scroll">
          <div className="names" aria-hidden="true">
            <span className="scenes-name" title={stillsError ? `The scenes' frames could not be made: ${stillsError}` : undefined}>
              Scenes
              {stillsError && <TriangleAlert size={11} />}
            </span>
            <span title={full ? `A message carries at most ${MAX_MARKS} marks` : 'Drag along this lane to mark a stretch of the film'}>
              Marks
            </span>
            {soundLanes.map((_, r) => (
              <span key={`sound-${r}`} title="The film's music and sound effects">
                {r === 0 ? 'Sound' : ''}
              </span>
            ))}
            {[...rows].map(([id, row]) => (
              <span key={id} title={row.label}>
                {row.label}
              </span>
            ))}
          </div>
          <div
            className="tracks"
            ref={tracks}
            onWheel={onWheel}
            onScroll={(event) => {
              const el = event.currentTarget;
              // The person scrolling the view while it plays takes it over from the playhead.
              if (!following.current && playing && Math.abs(el.scrollLeft - view.left) > 1) setFollow(false);
              following.current = false;
              setView({ left: el.scrollLeft, width: el.clientWidth });
            }}
          >
            <div className="timeline-grid" style={{ width: `${zoom * 100}%` }}>
              <div className="ruler" onClick={seekAt} role="presentation">
                {ticks.map((tick) => (
                  <span key={tick} style={{ left: at(tick) }}>
                    {timecode(tick)}
                  </span>
                ))}
              </div>
              <input
                className="timeline-seek"
                aria-label="Seek the film"
                type="range"
                min={0}
                max={seconds}
                step={1 / film.fps}
                value={Math.min(seconds, t)}
                onChange={(e) => onSeek(Number(e.target.value))}
                onPointerMove={(event) => setHover(timeAt(event))}
                onPointerLeave={() => setHover(null)}
              />
              {hover !== null && (
                <span className="ruler-hover" style={{ left: at(hover) }} aria-hidden="true">
                  {timecode(hover)}
                  {(() => {
                    const index = film.scenes.findIndex((s) => hover >= s.start && hover < s.start + s.duration);
                    return index < 0 ? null : ` · ${index + 1} ${sceneTitle(film.scenes[index]!)}`;
                  })()}
                </span>
              )}
              {issues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`issue-marker ${issue.severity}`}
                  style={{ left: at(issue.time!) }}
                  aria-label={`${issue.text} at ${timecode(issue.time!)}`}
                  data-tip={`${issue.text} · click to bring it to the assistant`}
                  onClick={() => onIssue(issue)}
                >
                  <TriangleAlert size={10} />
                </button>
              ))}
              <div className="lane scenes-lane">
                {film.scenes.map((scene) => (
                  <button
                    key={scene.id}
                    className={`scene${t >= scene.start && t < scene.start + scene.duration ? ' current' : ''}${selected?.scene === scene.id ? (selected.kind === 'scene' ? ' selected' : ' holds-selected') : ''}${hovered?.scene === scene.id ? ' holds-hovered' : ''}${fresh.has(changeKey({ kind: 'scene', scene: scene.id })) ? ' fresh' : ''}`}
                    aria-pressed={selected?.kind === 'scene' && selected.scene === scene.id}
                    style={{ left: at(scene.start), width: at(scene.duration) }}
                    title={`${sceneTitle(scene)} · ${timecode(scene.start)}–${timecode(scene.start + scene.duration)}`}
                    onClick={() => onSelect({ kind: 'scene', label: sceneTitle(scene), scene: scene.id, time: scene.start })}
                  >
                    <span className="scene-title">{sceneTitle(scene)}</span>
                    {stills?.[scene.id] && (
                      <span className="strip" aria-hidden="true">
                        {stripOf(stills[scene.id]!, (scene.duration / seconds) * grid).map((src, i) => (
                          <img key={i} src={src} alt="" />
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div
                className={`lane marks-lane${full ? ' full' : ''}`}
                onPointerDown={(event) => {
                  if (full || event.button !== 0 || event.target !== event.currentTarget) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const at = timeAt(event);
                  setRange({ from: at, to: at });
                }}
                onPointerMove={(event) => range && setRange({ ...range, to: timeAt(event) })}
                onPointerUp={endRange}
                onPointerCancel={() => setRange(null)}
              >
                {!marks.length && !range && <span className="hint">Drag here to mark a stretch of the film</span>}
                {marks.map((mark, i) =>
                  mark.end !== undefined ? (
                    <button
                      key={i}
                      className={`mark-range${lit === i ? ' lit' : ''}`}
                      style={{ left: at(mark.t), width: at(mark.end - mark.t) }}
                      aria-label={`Mark ${i + 1}, ${timecode(mark.t)} to ${timecode(mark.end)}`}
                      onClick={() => onSeek(mark.t)}
                    >
                      <span className="number">{i + 1}</span>
                    </button>
                  ) : (
                    <button
                      key={i}
                      className={`number flag${lit === i ? ' lit' : ''}`}
                      style={{ left: at(mark.t) }}
                      aria-label={`Mark ${i + 1} at ${timecode(mark.t)}`}
                      onClick={() => onSeek(mark.t)}
                    >
                      {i + 1}
                    </button>
                  ),
                )}
                {range && (
                  <span
                    className="mark-range drawing"
                    style={{ left: at(Math.min(range.from, range.to)), width: at(Math.abs(range.to - range.from)) }}
                  />
                )}
              </div>
              {soundLanes.map((row, r) => (
                <div key={r} className="lane sound-lane">
                  {row.map(({ sound, start, end, index }) => {
                    const wave = waves.get(sound.src);
                    const span = end - start;
                    const shape = wave && typeof wave === 'object' ? soundShape(sound, wave, Math.max(8, Math.min(600, Math.round(span * 20 * zoom)))) : [];
                    const failed = typeof wave === 'string' ? wave : null;
                    return (
                      <button
                        key={index}
                        type="button"
                        className={`sound-span${failed ? ' failed' : ''}`}
                        style={{ left: at(sound.at), width: at(Math.min(span, seconds - sound.at)) }}
                        aria-label={`${fileName(sound.src)}, ${timecode(sound.at)} to ${timecode(sound.at + span)}`}
                        title={
                          failed ??
                          `${sound.src} · ${timecode(sound.at)}–${timecode(sound.at + span)} · ${sound.volume} dB${sound.loop ? ' · looped' : ''}${
                            sound.fadeIn ? ` · fades in ${sound.fadeIn} s` : ''
                          }${sound.fadeOut ? ` · fades out ${sound.fadeOut} s` : ''}`
                        }
                        onClick={() => onSeek(sound.at)}
                      >
                        {shape.length > 0 && (
                          <svg viewBox={`0 0 ${shape.length} 2`} preserveAspectRatio="none" aria-hidden="true">
                            <path
                              d={`M0 1 ${shape.map((h, x) => `L${x + 0.5} ${1 - h}`).join(' ')} L${shape.length} 1 ${shape
                                .map((h, x) => `L${shape.length - x - 0.5} ${1 + shape[shape.length - 1 - x]!}`)
                                .join(' ')} Z`}
                            />
                          </svg>
                        )}
                        <span>{fileName(sound.src)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {[...rows].map(([id, row]) => (
                <div key={id} className="lane layer-lane">
                  {row.spans.map((span, i) => (
                    <button
                      key={i}
                      className={`layer-span${selected?.kind === 'layer' && selected.layer === span.layer.id && selected.scene === span.scene ? ' selected' : ''}${fresh.has(changeKey({ kind: 'layer', scene: span.scene, layer: span.layer.id })) ? ' fresh' : ''}${sameHovered(hovered, span.layer.id, span.scene) ? ' hovered' : ''}`}
                      onPointerEnter={() => onHover({ layer: span.layer.id, scene: span.scene })}
                      onPointerLeave={() => onHover(null)}
                      aria-label={`${span.layer.id}${span.scene ? ` in ${span.scene}` : ', global layer'}`}
                      title="Declared scene span; content may animate within it"
                      style={{ left: at(span.start), width: at(span.duration) }}
                      onClick={() =>
                        onSelect({
                          kind: 'layer',
                          label: span.layer.id,
                          layer: span.layer.id,
                          scene: span.scene,
                          time: span.start + Math.min(0.5, span.duration / 2),
                        })
                      }
                    >
                      {span.layer.id}
                    </button>
                  ))}
                </div>
              ))}
              <div className="playhead" style={{ left: at(t) }} />
            </div>
          </div>
          {off && (
            <button
              type="button"
              className={`playhead-chip ${off}`}
              aria-label={`Bring the playhead at ${timecode(t)} into view`}
              data-tip="Bring the playhead into view"
              onClick={() => scrollTo(playheadX - view.width / 2)}
            >
              {off === 'left' && <ChevronsLeft size={12} />}
              <span className="mono">{timecode(t)}</span>
              {off === 'right' && <ChevronsRight size={12} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
