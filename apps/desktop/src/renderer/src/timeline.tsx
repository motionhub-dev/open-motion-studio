// The read-only timeline: a ruler to seek on, the film's clips as its engine reports them (a
// lane per track: HyperFrames lists them, the other engines do not), the person's marks, and
// the playhead through all of them. A clip or a mark clicked seeks to its start.

import type { MouseEvent } from 'react';
import type { Mark } from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { timecode } from './preview';

/** The ruler's step: the first that gives at most about ten ticks. */
function stepFor(seconds: number): number {
  return [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((step) => seconds / step <= 10) ?? 600;
}

const short = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function Timeline({ film, t, marks, onSeek }: { film: FilmInfo; t: number; marks: Mark[]; onSeek(t: number): void }) {
  const seconds = film.seconds || 1;
  const at = (s: number) => `${Math.min(100, Math.max(0, (s / seconds) * 100))}%`;
  const step = stepFor(seconds);
  const ticks = Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step);
  const clips = film.clips ?? [];
  const tracks = [...new Set(clips.map((clip) => clip.track))].sort((a, b) => a - b);

  const seekAt = (event: MouseEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - r.left) / r.width) * seconds);
  };

  return (
    <div className="timeline" aria-label="Timeline">
      <div className="names" aria-hidden="true">
        {tracks.map((track) => (
          <span key={track}>Track {track + 1}</span>
        ))}
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
        {tracks.map((track) => (
          <div key={track} className="lane">
            {clips
              .filter((clip) => clip.track === track)
              .map((clip) => (
                <button
                  key={`${clip.id}-${clip.start}`}
                  type="button"
                  className={`clip${t >= clip.start && t < clip.start + clip.duration ? ' current' : ''}`}
                  style={{ left: at(clip.start), width: at(clip.duration) }}
                  title={`${clip.label}: ${timecode(clip.start)} to ${timecode(clip.start + clip.duration)}`}
                  onClick={() => onSeek(clip.start)}
                >
                  {clip.label}
                </button>
              ))}
          </div>
        ))}
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
