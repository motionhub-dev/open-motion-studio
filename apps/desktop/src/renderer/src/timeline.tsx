// The read-only timeline: a ruler to seek on, the film's scenes, the person's marks, and the
// playhead through them all. A scene clicked seeks to its start, a
// mark to its moment.

import type { MouseEvent } from 'react';
import type { Mark } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { timecode } from './preview';

/** The ruler's step: the first that gives at most about ten ticks. */
function stepFor(seconds: number): number {
  return [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((step) => seconds / step <= 10) ?? 600;
}

/** A tick's label, m:ss, with its half second where the step is one. */
const short = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${Number.isInteger(s) ? '' : '.5'}`;

export function Timeline({ film, t, marks, onSeek }: { film: FilmInfo; t: number; marks: Mark[]; onSeek(t: number): void }) {
  const seconds = film.seconds || 1;
  const at = (s: number) => `${Math.min(100, Math.max(0, (s / seconds) * 100))}%`;
  const step = stepFor(seconds);
  const ticks = Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step);

  const seekAt = (event: MouseEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - r.left) / r.width) * seconds);
  };

  return (
    <div className="timeline" aria-label="Timeline">
      <div className="names" aria-hidden="true">
        <span>Scenes</span>
        <span>Marks</span>
      </div>
      <div className="tracks">
        <div className="ruler" onClick={seekAt} role="presentation">
          {ticks.map((tick) => (
            <span key={tick} style={{ left: at(tick) }}>
              {short(tick)}
            </span>
          ))}
        </div>
        <div className="lane">
          {film.scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`scene${t >= scene.start && t < scene.start + scene.duration ? ' current' : ''}`}
              style={{ left: at(scene.start), width: at(scene.duration) }}
              title={[`${scene.id}: ${timecode(scene.start)} to ${timecode(scene.start + scene.duration)}`, ...scene.lines.map((line) => line.text)].join('\n')}
              onClick={() => onSeek(scene.start)}
            >
              {scene.id}
            </button>
          ))}
        </div>
        <div className="lane">
          {marks.map((mark, i) => (
            <button
              key={i}
              type="button"
              className="number flag"
              style={{ left: at(mark.t) }}
              title={`Mark ${i + 1} at ${timecode(mark.t)}`}
              aria-label={`Mark ${i + 1} at ${timecode(mark.t)}`}
              onClick={() => onSeek(mark.t)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="playhead" style={{ left: at(t) }} />
      </div>
    </div>
  );
}
