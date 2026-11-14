// A film's sounds mixed for its MP4 (ADR 0010): each <Sound>'s file found in the project, its length read by ffmpeg,
// and one filter graph that cuts, loops, levels, fades and places every sound, sums them without normalising, holds
// the sum under -1 dBFS and makes it as long as the film. The exporter (capture.ts) adds the graph to the ffmpeg that
// encodes the picture.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIR } from '../project';
import { type FilmSound, soundFades, soundPlace, soundRegion, soundSpan } from '../../shared/sound';
import { buildDir } from './film';
import { safePreviewFile } from './preview';

/** The rate every sound is mixed at. */
const RATE = 48000;
/** -1 dBFS, the most the mix may reach. */
const CEILING = 0.891;

/** A sound's file on disk: in the film's bundle or in the project, never outside it, in Git's or the Studio's folders. */
export async function soundFile(dir: string, src: string): Promise<string> {
  const place = soundPlace(src);
  const file = place && (await safePreviewFile(place.root === 'build' ? buildDir(dir) : dir, place.path, place.root === 'project').catch(() => null));
  if (!file) throw new Error(`<Sound src="${src}">: no such file in the project. A sound's src is a path in the project, as media/music.mp3.`);
  return file;
}

/** A media file's length in seconds, as ffmpeg reads it. */
export function mediaSeconds(ffmpeg: string, file: string): Promise<number> {
  return new Promise((done, fail) =>
    // ffmpeg with an input and no output says what the input is, and exits 1.
    execFile(ffmpeg, ['-hide_banner', '-i', file], { timeout: 30_000, windowsHide: true }, (_error, _stdout, stderr) => {
      const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr));
      if (!match) return fail(new Error(`${file} is no sound ffmpeg can read.`));
      done(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    }),
  );
}

const n = (value: number) => Number(value.toFixed(6)).toString();

/**
 * The ffmpeg inputs and filter graph that mix `sounds` (each with its file and that file's length) into `[aout]`, a
 * stereo track exactly `seconds` long. `first` is the input index of the first sound (the picture comes before them).
 * Null when nothing is heard.
 */
export function soundMix(
  sounds: { sound: FilmSound; file: string; fileSeconds: number }[],
  seconds: number,
  first: number,
): { inputs: string[]; graph: string } | null {
  const heard = sounds.filter(({ sound, fileSeconds }) => soundSpan(sound, fileSeconds) > 0 && sound.at < seconds);
  if (!heard.length) return null;
  const inputs: string[] = [];
  const chains = heard.map(({ sound, file, fileSeconds }, i) => {
    inputs.push('-i', file);
    const span = soundSpan(sound, fileSeconds);
    const region = soundRegion(sound, fileSeconds);
    const { fadeIn, fadeOut } = soundFades(sound, span);
    const steps = [
      `aresample=${RATE}`,
      'aformat=sample_fmts=fltp:channel_layouts=stereo',
      `atrim=start=${n(sound.trim)}:end=${n(sound.trim + region)}`,
      'asetpts=PTS-STARTPTS',
      // Looped: the region again and again, as many samples as it holds.
      ...(sound.loop ? [`aloop=loop=-1:size=${Math.max(1, Math.round(region * RATE))}`] : []),
      `atrim=end=${n(span)}`,
      'asetpts=PTS-STARTPTS',
      `volume=${n(sound.volume)}dB`,
      ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${n(fadeIn)}`] : []),
      ...(fadeOut > 0 ? [`afade=t=out:st=${n(span - fadeOut)}:d=${n(fadeOut)}`] : []),
      `adelay=${n(sound.at * 1000)}:all=1`,
    ];
    return `[${first + i}:a]${steps.join(',')}[s${i}]`;
  });
  const sum = `${heard.map((_, i) => `[s${i}]`).join('')}amix=inputs=${heard.length}:normalize=0:duration=longest`;
  const finish = `alimiter=limit=${CEILING}:level=false:latency=true,apad,atrim=end=${n(seconds)},asetpts=PTS-STARTPTS[aout]`;
  return { inputs, graph: [...chains, `${sum},${finish}`].join(';') };
}

/** How many peaks a second a waveform keeps. */
export const PEAKS_PER_SECOND = 50;
/** The rate a file is decoded at for its waveform: enough to find its peaks, little to read. */
const PEAK_RATE = 8000;

/** The loudest sample of each 1/PEAKS_PER_SECOND s of mono samples, from 0 to 1. */
export function peaksOf(samples: Float32Array, rate: number): number[] {
  const size = Math.max(1, Math.round(rate / PEAKS_PER_SECOND));
  const peaks: number[] = [];
  for (let start = 0; start < samples.length; start += size) {
    let peak = 0;
    for (let i = start; i < Math.min(samples.length, start + size); i++) peak = Math.max(peak, Math.abs(samples[i]!));
    peaks.push(Math.min(1, Number(peak.toFixed(3))));
  }
  return peaks;
}

/**
 * A sound's waveform for the timeline: its length and its peaks (PEAKS_PER_SECOND a second). Read with ffmpeg once for
 * each version of the file and kept in `.motion-studio/peaks/`, named by the file's path, size and time.
 */
export async function soundPeaks(dir: string, ffmpeg: string, src: string): Promise<{ seconds: number; peaks: number[] }> {
  const file = await soundFile(dir, src);
  const { size, mtimeMs } = await stat(file);
  const folder = join(dir, STATE_DIR, 'peaks');
  const kept = join(folder, `${createHash('sha256').update(`${file}\n${size}\n${mtimeMs}`).digest('hex').slice(0, 16)}.json`);
  try {
    return JSON.parse(await readFile(kept, 'utf8')) as { seconds: number; peaks: number[] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const pcm = await new Promise<Buffer>((done, fail) =>
    execFile(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-i', file, '-t', '1800', '-ac', '1', '-ar', String(PEAK_RATE), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 1800 * PEAK_RATE * 4 + 1024, timeout: 120_000, windowsHide: true },
      (error, stdout, stderr) => (error ? fail(new Error(`${src} could not be read: ${String(stderr).trim().split('\n').pop()}`)) : done(stdout)),
    ),
  );
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const waveform = { seconds: samples.length / PEAK_RATE, peaks: peaksOf(samples, PEAK_RATE) };
  await mkdir(folder, { recursive: true });
  await writeFile(`${kept}.partial`, JSON.stringify(waveform));
  await rename(`${kept}.partial`, kept);
  return waveform;
}

/** `sounds` with their files and those files' lengths, for soundMix. */
export async function soundInputs(dir: string, ffmpeg: string, sounds: FilmSound[]) {
  return Promise.all(
    sounds.map(async (sound) => {
      const file = await soundFile(dir, sound.src);
      return { sound, file, fileSeconds: await mediaSeconds(ffmpeg, file) };
    }),
  );
}
