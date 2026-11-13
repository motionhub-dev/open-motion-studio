// Read-only scene and layer timing. The declared spans explain structure, not pixel visibility.
// The marks lane shows the marks for the next message; dragging along it marks a stretch of the film.
import { useState, type MouseEvent, type PointerEvent } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { MAX_MARKS, type Mark, type Reference } from '../../shared/api';
import type { FilmInfo, LayerBox } from '../../shared/preview';
import { timecode } from './preview';
import { sceneTitle } from './outline';

function stepFor(seconds: number): number {
  return [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => seconds / step <= 10) ?? Math.ceil(seconds / 10);
}
export function Timeline({
  film,
  t,
  marks,
  lit,
  onRange,
  onSeek,
  selected,
  onSelect,
}: {
  film: FilmInfo;
  t: number;
  marks: Mark[];
  lit: number | null;
  onRange(start: number, end: number): void;
  onSeek(t: number): void;
  selected: Reference | null;
  onSelect(ref: Reference): void;
}) {
  const [zoom, setZoom] = useState(1);
  /** A stretch being dragged out on the marks lane, in seconds. */
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const seconds = film.seconds || 1;
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
  return (
    <div className="timeline-wrap">
      <div className="timeline-options">
        <span className="eyebrow">Scene & layer timing</span>
        <span className="spacer" />
        <button
          className="icon-button"
          aria-label="Zoom out timeline"
          disabled={zoom === 1}
          onClick={() => setZoom((z) => Math.max(1, z / 2))}
        >
          <Minus size={12} />
        </button>
        <span className="mono">{zoom}×</span>
        <button
          className="icon-button"
          aria-label="Zoom in timeline"
          disabled={zoom === 8}
          onClick={() => setZoom((z) => Math.min(8, z * 2))}
        >
          <Plus size={12} />
        </button>
        <button className="icon-button" aria-label="Fit timeline" data-tip="Fit the whole film" onClick={() => setZoom(1)}>
          <Scan size={12} />
        </button>
      </div>
      <div className="timeline" aria-label="Timeline">
        <div className="timeline-scroll">
          <div className="names" aria-hidden="true">
            <span>Scenes</span>
            <span title={full ? `A message carries at most ${MAX_MARKS} marks` : 'Drag along this lane to mark a stretch of the film'}>
              Marks
            </span>
            {[...rows].map(([id, row]) => (
              <span key={id} title={row.label}>
                {row.label}
              </span>
            ))}
          </div>
          <div className="tracks">
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
              />
              <div className="lane">
                {film.scenes.map((scene) => (
                  <button
                    key={scene.id}
                    className={`scene${t >= scene.start && t < scene.start + scene.duration ? ' current' : ''}${selected?.scene === scene.id ? ' selected' : ''}`}
                    aria-pressed={selected?.kind === 'scene' && selected.scene === scene.id}
                    style={{ left: at(scene.start), width: at(scene.duration) }}
                    title={`${sceneTitle(scene)} · ${timecode(scene.start)}–${timecode(scene.start + scene.duration)}`}
                    onClick={() => onSelect({ kind: 'scene', label: sceneTitle(scene), scene: scene.id, time: scene.start })}
                  >
                    {sceneTitle(scene)}
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
              {[...rows].map(([id, row]) => (
                <div key={id} className="lane layer-lane">
                  {row.spans.map((span, i) => (
                    <button
                      key={i}
                      className={`layer-span${selected?.kind === 'layer' && selected.layer === span.layer.id && selected.scene === span.scene ? ' selected' : ''}`}
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
        </div>
      </div>
    </div>
  );
}
