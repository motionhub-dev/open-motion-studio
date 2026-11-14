import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FilmSound } from '../../../shared/sound';
import { soundGain, soundPlace, soundSpan } from '../../../shared/sound';

vi.mock('electron', () => ({ app: { getAppPath: () => '' }, protocol: {} }));

const { mediaSeconds, soundFile, soundMix } = await import('../mix');

const ffmpeg = ffmpegStatic!;
const sound = (over: Partial<FilmSound>): FilmSound => ({
  src: 'media/a.mp3', at: 0, dur: null, until: 10, trim: 0, loop: false, volume: 0, fadeIn: 0, fadeOut: 0, ...over,
});

const run = (args: string[]) =>
  new Promise<string>((done, fail) =>
    execFile(ffmpeg, ['-hide_banner', ...args], { timeout: 60_000, windowsHide: true }, (error, _out, stderr) =>
      error ? fail(new Error(String(stderr))) : done(String(stderr)),
    ),
  );

describe('how long a sound plays and how loud', () => {
  it('plays its region once, again and again when looped, never past where it sits', () => {
    expect(soundSpan(sound({}), 3)).toBe(3);
    expect(soundSpan(sound({ trim: 1 }), 3)).toBe(2);
    expect(soundSpan(sound({ dur: 1.5 }), 3)).toBe(1.5);
    expect(soundSpan(sound({ at: 9 }), 3)).toBe(1);
    expect(soundSpan(sound({ loop: true, at: 2, until: 8 }), 3)).toBe(6);
  });

  it('is its volume through its fades, which shrink together when the sound is short', () => {
    const s = sound({ volume: -6, fadeIn: 1, fadeOut: 1 });
    expect(soundGain(s, 4, 0)).toBe(0);
    expect(soundGain(s, 4, 0.5)).toBeCloseTo(10 ** (-6 / 20) / 2);
    expect(soundGain(s, 4, 2)).toBeCloseTo(10 ** (-6 / 20));
    expect(soundGain(s, 4, 4)).toBe(0);
    // 1 s of fades in a 1 s sound: each 0.5 s, so it is fully up only at its middle.
    expect(soundGain(sound({ fadeIn: 1, fadeOut: 1 }), 1, 0.5)).toBeCloseTo(1);
  });

  it('is a file in the project or the film\'s bundle, nothing else', () => {
    expect(soundPlace('media/bed.mp3')).toEqual({ root: 'project', path: 'media/bed.mp3' });
    expect(soundPlace('./media/bed.mp3')).toEqual({ root: 'project', path: 'media/bed.mp3' });
    expect(soundPlace('build/bed-AB12.mp3')).toEqual({ root: 'build', path: 'bed-AB12.mp3' });
    for (const src of ['https://example.com/a.mp3', '/etc/a.mp3', 'C:/a.mp3', '../a.mp3', 'media/../../a.mp3', '']) expect(soundPlace(src)).toBeNull();
  });
});

describe('the export\'s mix', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'oms-mix-'));
    await mkdir(join(dir, 'media'));
    // A 1.5 s tone near full scale (the sine source is at 1/8 of it), and a quiet 0.5 s one.
    await run(['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-af', 'volume=17dB', join(dir, 'media', 'bed.wav')]);
    await run(['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.5', join(dir, 'media', 'hit.wav')]);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('cuts, loops, levels, fades and places each sound, and adds nothing for a film with none', () => {
    const bed = { sound: sound({ src: 'media/bed.wav', loop: true, until: 4, volume: -12, fadeIn: 1, fadeOut: 2 }), file: 'bed.wav', fileSeconds: 1.5 };
    const hit = { sound: sound({ src: 'media/hit.wav', at: 2.5, trim: 0.1, dur: 0.3, until: 4 }), file: 'hit.wav', fileSeconds: 0.5 };
    const mix = soundMix([bed, hit], 4, 1)!;
    expect(mix.inputs).toEqual(['-i', 'bed.wav', '-i', 'hit.wav']);
    const [first, second, sum] = mix.graph.split(';');
    expect(first).toBe(
      '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start=0:end=1.5,asetpts=PTS-STARTPTS,aloop=loop=-1:size=72000,atrim=end=4,asetpts=PTS-STARTPTS,volume=-12dB,afade=t=in:st=0:d=1,afade=t=out:st=2:d=2,adelay=0:all=1[s0]',
    );
    expect(second).toContain('[2:a]');
    expect(second).toContain('atrim=start=0.1:end=0.4');
    expect(second).toContain('atrim=end=0.3');
    expect(second).toContain('adelay=2500:all=1[s1]');
    expect(sum).toBe('[s0][s1]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.891:level=false:latency=true,apad,atrim=end=4,asetpts=PTS-STARTPTS[aout]');
    expect(soundMix([], 4, 1)).toBeNull();
    expect(soundMix([{ ...hit, sound: { ...hit.sound, at: 5 } }], 4, 1)).toBeNull();
  });

  it('reaches the file as long as the film, under -1 dBFS', async () => {
    const bed = await soundFile(dir, 'media/bed.wav');
    const hit = await soundFile(dir, './media/hit.wav');
    expect(await mediaSeconds(ffmpeg, bed)).toBeCloseTo(1.5, 1);
    const mix = soundMix(
      [
        { sound: sound({ src: 'media/bed.wav', loop: true, until: 4, volume: 6 }), file: bed, fileSeconds: await mediaSeconds(ffmpeg, bed) },
        { sound: sound({ src: 'media/hit.wav', at: 1, until: 4, volume: 6 }), file: hit, fileSeconds: await mediaSeconds(ffmpeg, hit) },
      ],
      4,
      0,
    )!;
    const out = join(dir, 'mix.wav');
    await run(['-y', '-loglevel', 'error', ...mix.inputs, '-filter_complex', mix.graph, '-map', '[aout]', out]);
    expect(await mediaSeconds(ffmpeg, out)).toBeCloseTo(4, 2);
    const stats = await run(['-i', out, '-af', 'astats=measure_overall=Peak_level:measure_perchannel=none', '-f', 'null', '-']);
    const peak = Number(/Peak level dB: (-?[\d.]+)/.exec(stats)?.[1]);
    // Raised 6 dB, the tone would clip; the limiter holds it at -1 dBFS.
    expect(peak).toBeLessThanOrEqual(-0.9);
    expect(peak).toBeGreaterThan(-2);
  }, 60_000);

  it('refuses a sound outside the project, or in its hidden folders', async () => {
    await writeFile(join(dir, 'secret.txt'), 'x');
    for (const src of ['../secret.txt', 'https://example.com/a.mp3', 'media/missing.wav', '.git/config']) {
      await expect(soundFile(dir, src)).rejects.toThrow('no such file in the project');
    }
  });
});
