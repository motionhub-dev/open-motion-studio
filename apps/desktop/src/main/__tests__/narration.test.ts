import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getAppPath: () => '' }, protocol: {}, safeStorage: {} }));

const { clipKey, readNarration, voiceFilm, voiceOf } = await import('../narration');

const ffmpeg = ffmpegStatic!;
let dir: string;
let tone: Buffer;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-narration-'));
  // A half-second tone stands for a provider's speech.
  await new Promise<void>((done, fail) =>
    execFile(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=0.5', join(dir, 'tone.mp3')], (e) => (e ? fail(e) : done())),
  );
  tone = await readFile(join(dir, 'tone.mp3'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const film = (texts: string[], voice: string | null = 'openai:nova') => ({
  voice,
  scenes: [{ id: 'a', start: 0, duration: 4, layers: [], lines: texts.map((text, i) => ({ id: `l${i}`, text, start: i, end: i + 1 })) }],
});

describe('voicing a film', () => {
  it('speaks each line once into voice/, keeps what it has, and removes only its own clips no line uses', async () => {
    const project = join(dir, 'p1');
    await mkdir(join(project, 'voice'), { recursive: true });
    await writeFile(join(project, 'voice', 'notes.txt'), 'mine');
    const speech = vi.fn(async (_setup, _voice, text: string) => ({ audio: tone, words: [{ text: text.split(' ')[0]!, start: 0, end: 0.3 }] }));
    const setupFor = vi.fn(async () => ({ kind: 'openai' as const, key: 'sk' }));

    const first = await voiceFilm(project, film(['Heat moves uphill.', 'If you push it.', '  ']), setupFor, ffmpeg, undefined, speech);
    expect(first).toMatchObject({ spoken: 2, kept: 0, characters: 33 });
    expect(first.seconds).toBeGreaterThan(0.4);
    const narration = (await readNarration(project))!;
    const key = clipKey('openai:nova', undefined, 'Heat moves uphill.');
    expect(narration).toEqual({ voice: 'openai:nova', lines: { l0: key, l1: clipKey('openai:nova', undefined, 'If you push it.') } });
    const clip = JSON.parse(await readFile(join(project, 'voice', `${key}.json`), 'utf8'));
    expect(clip).toMatchObject({ text: 'Heat moves uphill.', voice: 'openai:nova', words: [{ text: 'Heat', start: 0, end: 0.3 }] });

    // Again, nothing changed: nothing is spoken, nothing paid for.
    expect(await voiceFilm(project, film(['Heat moves uphill.', 'If you push it.']), setupFor, ffmpeg, undefined, speech)).toMatchObject({ spoken: 0, kept: 2 });
    expect(speech).toHaveBeenCalledTimes(2);

    // A line changed: it alone is spoken again, and the clip of its old words goes; the person's own file stays.
    await voiceFilm(project, film(['Heat moves uphill.', 'If you push it hard.']), setupFor, ffmpeg, undefined, speech);
    expect(speech).toHaveBeenCalledTimes(3);
    const files = await readdir(join(project, 'voice'));
    expect(files).toContain('notes.txt');
    expect(files.filter((f) => f.endsWith('.mp3'))).toHaveLength(2);
    expect(files).not.toContain(`${clipKey('openai:nova', undefined, 'If you push it.')}.mp3`);
  });

  it('needs a voice the Studio speaks through, and lines to speak', async () => {
    const setupFor = vi.fn();
    await expect(voiceFilm(join(dir, 'p2'), film(['x'], null), setupFor, ffmpeg)).rejects.toThrow('names no voice');
    await expect(voiceFilm(join(dir, 'p2'), film(['x'], 'edge:aria'), setupFor, ffmpeg)).rejects.toThrow('Azure, ElevenLabs, MiniMax, OpenAI');
    await expect(voiceFilm(join(dir, 'p2'), film(['  ']), setupFor, ffmpeg)).rejects.toThrow('no lines to speak');
    expect(voiceOf('azure:zh-CN-XiaoxiaoNeural')).toEqual({ kind: 'azure', name: 'zh-CN-XiaoxiaoNeural' });
    expect(setupFor).not.toHaveBeenCalled();
  });
});
