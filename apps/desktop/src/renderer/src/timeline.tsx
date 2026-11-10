// The read-only timeline: the film's clips as its engine reports them, a lane per track,
// with the playhead. A clip clicked seeks to its start. Only an engine that knows its clips
// reports them (HyperFrames); for the others there is no timeline.

import type { Clip } from '../../shared/preview';

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function Timeline({ clips, seconds, t, onSeek }: { clips: Clip[]; seconds: number; t: number; onSeek(t: number): void }) {
  const tracks = [...new Set(clips.map((clip) => clip.track))].sort((a, b) => a - b);
  const at = (s: number) => `${Math.min(100, Math.max(0, (s / seconds) * 100))}%`;
  return (
    <div className="timeline" aria-label="Timeline">
      {tracks.map((track) => (
        <div key={track} className="lane">
          {clips
            .filter((clip) => clip.track === track)
            .map((clip) => (
              <button
                key={`${clip.id}-${clip.start}`}
                type="button"
                className="clip"
                style={{ left: at(clip.start), width: at(clip.duration) }}
                title={`${clip.label}: ${clock(clip.start)} to ${clock(clip.start + clip.duration)}`}
                onClick={() => onSeek(clip.start)}
              >
                {clip.label}
              </button>
            ))}
        </div>
      ))}
      <div className="playhead" style={{ left: at(t) }} />
    </div>
  );
}
