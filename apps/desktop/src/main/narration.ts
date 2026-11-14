// A film's narration (ADR 0011, 0012): each line spoken in the film's voice through the person's provider, kept in the
// project's voice/ so git keeps it with the film and the same words are never paid for twice.
//
//   voice/<key>.mp3     a line's speech, brought to -16 LUFS
//   voice/<key>.json    its words, voice, length and words' times: {text, voice, seconds, words}
//   voice/lines.json    which clip each line of the film is: {voice, lines: {[line id]: key}}
//
// A clip's key is a hash of the voice, the model and the words, so a changed line is spoken again and an unchanged one
// is kept. Voicing removes the clips no line uses any more, and nothing else: only names the Studio gave.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VoiceKind, VoicedFilm } from '../shared/api';
import type { FilmInfo } from '../shared/preview';
import { mediaSeconds } from './film/mix';
import { VOICE_KINDS, VOICE_NAMES } from './providers';
import { type Speech, type VoiceIo, type VoiceSetup, type Word, speak } from './voice';

export const VOICE_DIR = 'voice';
const LINES = 'lines.json';
/** A clip's own name: what voicing may remove, and nothing else. */
const CLIP = /^[0-9a-f]{16}\.(mp3|json)$/;

export interface Clip {
  text: string;
  voice: string;
  seconds: number;
  words: Word[];
}

export interface Narration {
  voice: string;
  lines: Record<string, string>;
}

/** A film's voice, `provider:name`, taken apart. */
export function voiceOf(voice: string | null): { kind: VoiceKind; name: string } {
  const at = voice?.indexOf(':') ?? -1;
  const kind = voice?.slice(0, at) as VoiceKind;
  if (!voice || at < 0 || !VOICE_KINDS.includes(kind)) {
    throw new Error(
      voice
        ? `<Film voice="${voice}">: the Studio speaks through ${VOICE_KINDS.map((k) => VOICE_NAMES[k]).join(', ')}, as voice="azure:zh-CN-XiaoxiaoNeural".`
        : 'The film names no voice: give its <Film> one, as voice="azure:zh-CN-XiaoxiaoNeural".',
    );
  }
  return { kind, name: voice.slice(at + 1) };
}

/** The key a line's clip is kept under: its voice, the provider's model and its words. */
export const clipKey = (voice: string, model: string | undefined, text: string): string =>
  createHash('sha256').update(`${voice}\n${model ?? ''}\n${text}`).digest('hex').slice(0, 16);

/** A clip's speech brought to -16 LUFS (true peak -1.5 dBTP), as MP3 at 48 kHz. */
function normalised(ffmpeg: string, from: string, to: string): Promise<void> {
  return new Promise((done, fail) =>
    execFile(
      ffmpeg,
      ['-y', '-hide_banner', '-loglevel', 'error', '-i', from, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '128k', to],
      { timeout: 120_000, windowsHide: true },
      (error, _out, stderr) => (error ? fail(new Error(`The speech could not be levelled: ${String(stderr).trim().split('\n').pop()}`)) : done()),
    ),
  );
}

/** The film's narration as voice/lines.json keeps it, or null when it has none. */
export async function readNarration(dir: string): Promise<Narration | null> {
  try {
    return JSON.parse(await readFile(join(dir, VOICE_DIR, LINES), 'utf8')) as Narration;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`voice/${LINES} could not be read: ${(error as Error).message}`);
  }
}

/**
 * Speaks every line of `film` that has words in the film's voice, through the provider `setupFor` opens, into the project's
 * voice/; a line already spoken in that voice, with those words, is kept. `onLine` hears each line as it is done.
 */
export async function voiceFilm(
  dir: string,
  film: Pick<FilmInfo, 'scenes' | 'voice'>,
  setupFor: (kind: VoiceKind) => Promise<VoiceSetup>,
  ffmpeg: string,
  onLine: (done: number, of: number) => void = () => {},
  speech: (setup: VoiceSetup, voice: string, text: string) => Promise<Speech> = (setup, voice, text) => speak(setup, voice, text),
): Promise<VoicedFilm> {
  const { kind, name } = voiceOf(film.voice);
  const lines = film.scenes.flatMap((scene) => scene.lines).filter((line) => line.text.trim());
  if (!lines.length) throw new Error('The film has no lines to speak: write what each scene says as its <Line>s.');
  const setup = await setupFor(kind);
  const folder = join(dir, VOICE_DIR);
  await mkdir(folder, { recursive: true });
  const kept = new Set((await readdir(folder)).filter((file) => CLIP.test(file)));
  const narration: Narration = { voice: film.voice!, lines: {} };
  const outcome: VoicedFilm = { spoken: 0, kept: 0, characters: 0, seconds: 0 };
  for (const [i, line] of lines.entries()) {
    const key = clipKey(film.voice!, setup.model, line.text);
    narration.lines[line.id] = key;
    if (kept.has(`${key}.mp3`) && kept.has(`${key}.json`)) {
      outcome.kept++;
    } else {
      const spoken = await speech(setup, name, line.text);
      // Written whole, then moved into place: a clip there is always a whole one.
      const raw = join(folder, `${key}.raw.mp3`);
      await writeFile(raw, spoken.audio);
      try {
        await normalised(ffmpeg, raw, join(folder, `${key}.partial.mp3`));
      } finally {
        await rm(raw, { force: true });
      }
      await rename(join(folder, `${key}.partial.mp3`), join(folder, `${key}.mp3`));
      const seconds = await mediaSeconds(ffmpeg, join(folder, `${key}.mp3`));
      const clip: Clip = { text: line.text, voice: film.voice!, seconds, words: spoken.words.map((w) => ({ ...w, end: Math.min(w.end, seconds) })) };
      await writeFile(join(folder, `${key}.json`), `${JSON.stringify(clip, null, 2)}\n`);
      outcome.spoken++;
      outcome.characters += line.text.length;
      outcome.seconds += seconds;
    }
    onLine(i + 1, lines.length);
  }
  await writeFile(join(folder, LINES), `${JSON.stringify(narration, null, 2)}\n`);
  // The clips no line uses any more: only names the Studio gave are ever removed.
  const used = new Set(Object.values(narration.lines));
  for (const file of await readdir(folder)) if (CLIP.test(file) && !used.has(file.slice(0, 16))) await rm(join(folder, file), { force: true });
  return outcome;
}
