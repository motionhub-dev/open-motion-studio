// A film's lines as subtitles for its MP4 (docs/tech/sound-and-captions.md, slice B): SubRip, one cue for each line,
// shown while it is said. The exporter embeds it as a soft subtitle track and writes it beside the video.

import type { FilmInfo } from '../../shared/preview';

/** Seconds as SubRip writes a time: 00:01:02,345. */
export function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** The film's lines as a SubRip file, or null when it says nothing. */
export function srt(film: Pick<FilmInfo, 'scenes'>): string | null {
  const lines = film.scenes.flatMap((scene) => scene.lines).filter((line) => line.text.trim() && line.end > line.start);
  if (!lines.length) return null;
  return lines.map((line, i) => `${i + 1}\n${srtTime(line.start)} --> ${srtTime(line.end)}\n${line.text.trim().replace(/\r?\n+/g, '\n')}\n`).join('\n');
}
