// The film's preview: its page in a sandboxed frame on the oms-preview: scheme, driven by
// the preview bridge protocol (src/shared/preview.ts), with a transport under it. A new
// build reloads the frame at the same time. Two tools point at the picture for the agent:
// pick an element (the page's studio/pick.js names it) or drag out a region. Each makes a
// mark at that moment, which goes with the next message.

import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { type BuildResult, MAX_MARKS, type Mark } from '../../shared/api';
import type { Box, FilmInfo, FromPreview, ToPreview } from '../../shared/preview';

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

type Tool = 'pick' | 'region' | null;

/** Where the frame is drawn in a stage of this size: contained and centred, as every page draws it. */
function frameIn(stage: DOMRect, film: FilmInfo) {
  const scale = Math.min(stage.width / film.width, stage.height / film.height);
  const width = film.width * scale;
  const height = film.height * scale;
  return { left: (stage.width - width) / 2, top: (stage.height - height) / 2, width, height };
}

/** A mark shows on the picture while the playhead is this close to its moment. */
const NEAR = 0.25;

export function Preview({ build, marks, onMark }: { build: BuildResult | null; marks: Mark[]; onMark(mark: Mark): void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [film, setFilm] = useState<FilmInfo | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [size, setSize] = useState<DOMRect | null>(null);
  const picked = useRef<((message: Extract<FromPreview, { type: 'oms:picked' }>) => void) | null>(null);
  const resume = useRef(0);
  resume.current = t;

  const tell = (message: ToPreview) => frame.current?.contentWindow?.postMessage(message, '*');

  useEffect(() => {
    const onMessage = (event: MessageEvent<FromPreview>) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === 'oms:ready') {
        setFilm(message.film);
        setError(null);
        // a rebuilt film opens where the last one was
        tell({ type: 'oms:seek', t: Math.min(resume.current, message.film.seconds) });
      } else if (message?.type === 'oms:time') {
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

  useEffect(() => setError(null), [build?.version]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize(element.getBoundingClientRect()));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!tool) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTool(null);
        setDrag(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [tool]);

  const full = marks.length >= MAX_MARKS;
  const box = size && film ? frameIn(size, film) : null;

  function choose(next: Tool) {
    if (playing) tell({ type: 'oms:pause' });
    setTool((current) => (current === next ? null : next));
  }

  /** A point on the stage as fractions of the frame, or null outside it. */
  function point(event: PointerEvent) {
    if (!box || !stage.current) return null;
    const r = stage.current.getBoundingClientRect();
    const x = (event.clientX - r.left - box.left) / box.width;
    const y = (event.clientY - r.top - box.top) / box.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  }

  function down(event: PointerEvent) {
    const p = point(event);
    if (!p || full) return;
    if (tool === 'pick') {
      const at = t;
      picked.current = (message) => {
        // Where nothing is drawn, the point itself is marked, as a small region.
        const fallback: Box = { x: Math.max(0, p.x - 0.02), y: Math.max(0, p.y - 0.02), w: 0.04, h: 0.04 };
        onMark({ t: at, box: message.box ?? fallback, element: message.element });
      };
      tell({ type: 'oms:pick', x: p.x, y: p.y });
    } else if (tool === 'region') {
      (event.target as Element).setPointerCapture(event.pointerId);
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  }

  function move(event: PointerEvent) {
    if (!drag || !box || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setDrag({ ...drag, x1: clamp((event.clientX - r.left - box.left) / box.width), y1: clamp((event.clientY - r.top - box.top) / box.height) });
  }

  function up() {
    if (!drag) return;
    const region = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    setDrag(null);
    if (region.w > 0.01 && region.h > 0.01) onMark({ t, box: region, element: null });
  }

  const place = (b: Box) =>
    box && { left: box.left + b.x * box.width, top: box.top + b.y * box.height, width: b.w * box.width, height: b.h * box.height };

  return (
    <div className="preview">
      <div className="stage" ref={stage}>
        {build?.ok && (
          <iframe
            key={build.version}
            ref={frame}
            title="Film preview"
            sandbox="allow-scripts"
            src={`oms-preview://film/?v=${build.version}`}
          />
        )}
        {film && box && (
          <div
            className={`marks${tool ? ` tool-${tool}` : ''}`}
            onPointerDown={tool ? down : undefined}
            onPointerMove={tool ? move : undefined}
            onPointerUp={tool ? up : undefined}
          >
            {marks.map((mark, i) =>
              Math.abs(mark.t - t) <= NEAR ? (
                <div key={i} className="mark" style={place(mark.box) ?? undefined}>
                  <span>{i + 1}</span>
                </div>
              ) : null,
            )}
            {drag && (
              <div
                className="mark drawing"
                style={place({ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }) ?? undefined}
              />
            )}
          </div>
        )}
        {!build && <p className="note">Building the film…</p>}
        {build && !build.ok && (
          <pre className="problem" role="alert">
            {build.errors.join('\n')}
          </pre>
        )}
        {build?.ok && error && (
          <pre className="problem" role="alert">
            {error}
          </pre>
        )}
      </div>
      <div className="transport">
        <button type="button" onClick={() => tell(playing ? { type: 'oms:pause' } : { type: 'oms:play' })} disabled={!film} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="scrub">
          <input
            type="range"
            min={0}
            max={film?.seconds ?? 0}
            step={0.01}
            value={t}
            disabled={!film}
            aria-label="Time"
            onChange={(e) => tell({ type: 'oms:seek', t: Number(e.target.value) })}
          />
          {film &&
            marks.map((mark, i) => (
              <button
                key={i}
                type="button"
                className="flag"
                style={{ left: `${(mark.t / film.seconds) * 100}%` }}
                title={`Mark ${i + 1} at ${clock(mark.t)}`}
                onClick={() => tell({ type: 'oms:seek', t: mark.t })}
              >
                {i + 1}
              </button>
            ))}
        </div>
        <span className="time">
          {clock(t)} / {clock(film?.seconds ?? 0)}
        </span>
        <button
          type="button"
          aria-pressed={tool === 'pick'}
          disabled={!film || full}
          title={full ? `A message carries at most ${MAX_MARKS} marks` : 'Pick an element on the picture (Esc to stop)'}
          onClick={() => choose('pick')}
        >
          Pick
        </button>
        <button
          type="button"
          aria-pressed={tool === 'region'}
          disabled={!film || full}
          title={full ? `A message carries at most ${MAX_MARKS} marks` : 'Drag out a region of the picture (Esc to stop)'}
          onClick={() => choose('region')}
        >
          Region
        </button>
      </div>
    </div>
  );
}
