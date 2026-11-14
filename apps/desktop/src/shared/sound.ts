// A film's sounds as the Studio plays and mixes them (ADR 0010): where a <Sound>'s file is, how long it plays and
// how loud it is at each moment. One reading, so the preview, the export and the timeline agree.

import type { FilmSound } from '@motionhub/runtime';

export type { FilmSound };

/**
 * Where a sound's `src` is: a file the film imported (the bundle names it `build/…`), or a path in the project. Null
 * for anything else (an address, an absolute path, a step out of the project), which a film cannot play.
 */
export function soundPlace(src: string): { root: 'build' | 'project'; path: string } | null {
  const path = src.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!path || path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split('/').includes('..')) return null;
  return path.startsWith('build/') ? { root: 'build', path: path.slice('build/'.length) } : { root: 'project', path };
}

/** The seconds of its file a sound plays round: `dur` from `trim`, else the rest of the file. */
export const soundRegion = (sound: FilmSound, fileSeconds: number): number => Math.max(0, sound.dur ?? fileSeconds - sound.trim);

/** How long a sound plays in the film: its region once (again and again with `loop`), never past `until`. */
export const soundSpan = (sound: FilmSound, fileSeconds: number): number =>
  Math.max(0, Math.min(sound.loop ? Infinity : soundRegion(sound, fileSeconds), sound.until - sound.at));

/** Its fades, shortened together in proportion when they would not fit in its span. */
export function soundFades(sound: FilmSound, span: number): { fadeIn: number; fadeOut: number } {
  const total = sound.fadeIn + sound.fadeOut;
  const fit = total > span && total > 0 ? span / total : 1;
  return { fadeIn: sound.fadeIn * fit, fadeOut: sound.fadeOut * fit };
}

export const decibels = (db: number): number => 10 ** (db / 20);

/** The sound's gain `u` seconds into its span: its volume, through its fades. */
export function soundGain(sound: FilmSound, span: number, u: number): number {
  const { fadeIn, fadeOut } = soundFades(sound, span);
  if (u < 0 || u > span) return 0;
  const rise = fadeIn > 0 ? Math.min(1, u / fadeIn) : 1;
  const fall = fadeOut > 0 ? Math.min(1, (span - u) / fadeOut) : 1;
  return decibels(sound.volume) * Math.min(rise, fall);
}
