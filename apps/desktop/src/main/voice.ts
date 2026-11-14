// The voices a film's lines are spoken in (ADR 0011, 0012): the person's own provider, called from the main process with
// their key, each one's answer read into one shape: an MP3 and its words, each with when it is said. Every call goes
// through `io`, so a test answers in place of the network.
//
//   Azure       its Speech service's WebSocket with the key: the audio and each word's boundary
//   ElevenLabs  `with-timestamps`: the audio and each character's time, read into words
//   MiniMax     `t2a_v2` with word subtitles: links to the audio and to each word's time
//   OpenAI      `/audio/speech`, then one `/audio/transcriptions` of that audio with word timestamps

import { randomUUID } from 'node:crypto';
import type { VoiceChoice, VoiceKind } from '../shared/api';

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** A line spoken: its MP3, and its words in seconds into it. */
export interface Speech {
  audio: Buffer;
  words: Word[];
}

/** A provider as the person set it up, its key opened for the call. */
export interface VoiceSetup {
  kind: VoiceKind;
  key: string;
  /** Azure: its region (`eastasia`); MiniMax: `global` or `china`, which site the account is on. */
  region?: string;
  /** MiniMax: the account's group id. */
  groupId?: string;
  /** The provider's model, where it has several (ElevenLabs, MiniMax, OpenAI). */
  model?: string;
}

/** What a call reaches: the network, or a test's answers. */
export interface VoiceIo {
  fetch: typeof fetch;
  WebSocket: new (url: string, init?: { headers?: Record<string, string> }) => SocketLike;
}

/** As much of a WebSocket as the Azure call uses. */
export interface SocketLike {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

const NETWORK: VoiceIo = { fetch: (...args) => fetch(...args), WebSocket: WebSocket as unknown as VoiceIo['WebSocket'] };

/** How long one line may take to be spoken before the call gives up. */
const LINE_MS = 90_000;

const round = (t: number) => Math.round(t * 1000) / 1000;

/** Han, kana, Hangul and Thai are written without spaces: a provider times them a character at a time. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

/** Characters (or syllables) each with a time, grouped into words at the blanks between them; unspaced text keeps each one. */
export function groupWords(pieces: { text: string; start: number; end: number }[]): Word[] {
  const words: Word[] = [];
  let run: typeof pieces = [];
  const flush = () => {
    const text = run.map((p) => p.text).join('').trim();
    if (text) words.push({ text, start: round(run[0]!.start), end: round(run[run.length - 1]!.end) });
    run = [];
  };
  for (const piece of pieces) {
    if (!piece.text.trim()) flush();
    else if (UNSPACED.test(piece.text)) {
      flush();
      run = [piece];
      flush();
    } else run.push(piece);
  }
  flush();
  return words;
}

/** The text as SSML takes it. */
const escape = (text: string) => text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** A rate as SSML's prosody gives it: 1.25 is "+25%". */
const rate = (speed: number) => `${speed >= 1 ? '+' : ''}${Math.round((speed - 1) * 100)}%`;

/** Azure's message: its headers, a blank line, its body. */
const message = (path: string, type: string, body: string, request: string) =>
  `Path:${path}\r\nX-RequestId:${request}\r\nX-Timestamp:${new Date().toISOString()}\r\nContent-Type:${type}\r\n\r\n${body}`;

/** An Azure binary frame: two bytes giving its headers' length, its headers, then its audio. */
export function azureAudio(frame: ArrayBuffer): { path: string; audio: Buffer } {
  const bytes = Buffer.from(frame);
  const length = bytes.readUInt16BE(0);
  const headers = bytes.subarray(2, 2 + length).toString('utf8');
  return { path: /Path:\s*([\w.]+)/i.exec(headers)?.[1] ?? '', audio: bytes.subarray(2 + length) };
}

/** An Azure text frame's path and body. */
export function azureText(frame: string): { path: string; body: string } {
  const at = frame.indexOf('\r\n\r\n');
  const headers = at < 0 ? frame : frame.slice(0, at);
  return { path: /Path:\s*([\w.]+)/i.exec(headers)?.[1] ?? '', body: at < 0 ? '' : frame.slice(at + 4) };
}

/** The words in an Azure `audio.metadata` body: each WordBoundary, its offset and length in 100-ns ticks. */
export function azureWords(body: string): Word[] {
  const metadata = (JSON.parse(body) as { Metadata?: { Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string } } }[] }).Metadata ?? [];
  return metadata
    .filter((m) => m.Type === 'WordBoundary' && m.Data?.text?.Text)
    .map((m) => ({ text: m.Data!.text!.Text!, start: round((m.Data!.Offset ?? 0) / 1e7), end: round(((m.Data!.Offset ?? 0) + (m.Data!.Duration ?? 0)) / 1e7) }));
}

/** A line through Azure's Speech service: its WebSocket, the key in its handshake, word boundaries asked for. */
function azure(setup: VoiceSetup, voice: string, text: string, speed: number, io: VoiceIo): Promise<Speech> {
  const region = setup.region?.trim();
  if (!region || !/^[a-z0-9]+$/.test(region)) throw new Error('Azure needs its region, as eastasia or eastus: Models has it beside the key.');
  const lang = /^([a-z]{2,3}-[A-Z]{2})-/.exec(voice)?.[1] ?? 'en-US';
  const request = randomUUID().replace(/-/g, '');
  return new Promise<Speech>((done, fail) => {
    const socket = new io.WebSocket(
      `wss://${region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1?X-ConnectionId=${randomUUID().replace(/-/g, '')}`,
      { headers: { 'Ocp-Apim-Subscription-Key': setup.key } },
    );
    socket.binaryType = 'arraybuffer';
    const audio: Buffer[] = [];
    const words: Word[] = [];
    let ended = false;
    const timer = setTimeout(() => finish(new Error('Azure did not finish speaking the line in time.')), LINE_MS);
    const finish = (error?: Error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      socket.close();
      if (error) fail(error);
      else if (!audio.length) fail(new Error('Azure answered with no speech: check the voice’s name.'));
      else done({ audio: Buffer.concat(audio), words });
    };
    socket.onopen = () => {
      socket.send(message('speech.config', 'application/json', JSON.stringify({ context: { system: { name: 'SpeechSDK', version: '1.0.0', build: 'JavaScript', lang: 'JavaScript' } } }), request));
      socket.send(
        message(
          'synthesis.context',
          'application/json',
          JSON.stringify({
            synthesis: {
              audio: {
                metadataOptions: { bookmarkEnabled: false, punctuationBoundaryEnabled: false, sentenceBoundaryEnabled: false, wordBoundaryEnabled: true },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
              language: { autoDetection: false },
            },
          }),
          request,
        ),
      );
      socket.send(
        message(
          'ssml',
          'application/ssml+xml',
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${escape(voice)}'><prosody rate='${rate(speed)}'>${escape(text)}</prosody></voice></speak>`,
          request,
        ),
      );
    };
    socket.onmessage = ({ data }) => {
      if (typeof data === 'string') {
        const { path, body } = azureText(data);
        if (path === 'audio.metadata') words.push(...azureWords(body));
        else if (path === 'turn.end') finish();
      } else {
        const frame = azureAudio(data);
        if (frame.path === 'audio' && frame.audio.length) audio.push(frame.audio);
      }
    };
    socket.onerror = () => finish(new Error('Azure refused the connection: check the key, and that the region is the resource’s own.'));
    socket.onclose = ({ code, reason }) => finish(new Error(`Azure closed the connection before the line was spoken (${code}${reason ? `: ${reason}` : ''}).`));
  });
}

/** A JSON answer, or the provider's own words when it fails. */
async function answer<T>(response: Response, who: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${who} answered ${response.status}: ${text.slice(0, 300) || response.statusText}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${who} answered with something that is not JSON.`);
  }
}

/** ElevenLabs' character times, read into words. */
export function elevenLabsWords(alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] {
  return groupWords(
    alignment.characters.map((text, i) => ({ text, start: alignment.character_start_times_seconds[i] ?? 0, end: alignment.character_end_times_seconds[i] ?? 0 })),
  );
}

async function elevenLabs(setup: VoiceSetup, voice: string, text: string, speed: number, io: VoiceIo): Promise<Speech> {
  const response = await io.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': setup.key, 'Content-Type': 'application/json' },
    // Its speed is 0.7 to 1.2; it refuses any other.
    body: JSON.stringify({ text, model_id: setup.model || 'eleven_multilingual_v2', voice_settings: { speed: Math.min(1.2, Math.max(0.7, speed)) } }),
  });
  const json = await answer<{ audio_base64?: string; alignment?: Parameters<typeof elevenLabsWords>[0] | null }>(response, 'ElevenLabs');
  if (!json.audio_base64) throw new Error('ElevenLabs answered with no speech.');
  return { audio: Buffer.from(json.audio_base64, 'base64'), words: json.alignment ? elevenLabsWords(json.alignment) : [] };
}

/** MiniMax's subtitle entries (a syllable, a character, or the blank between two words, in milliseconds), read into words. */
export function miniMaxWords(subtitles: unknown): Word[] {
  const entries = (Array.isArray(subtitles) ? subtitles : [subtitles]).flatMap(
    (s) => ((s as { timestamped_words?: { word: string; time_begin: number; time_end: number }[] } | null)?.timestamped_words ?? []),
  );
  return groupWords(entries.map((e) => ({ text: e.word, start: e.time_begin / 1000, end: e.time_end / 1000 })));
}

async function miniMax(setup: VoiceSetup, voice: string, text: string, speed: number, io: VoiceIo): Promise<Speech> {
  if (!setup.groupId) throw new Error('MiniMax needs its group id: Models has it beside the key.');
  const base = setup.region === 'china' ? 'https://api.minimaxi.com' : 'https://api.minimax.io';
  const response = await io.fetch(`${base}/v1/t2a_v2?GroupId=${encodeURIComponent(setup.groupId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${setup.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: setup.model || 'speech-2.8-hd',
      text,
      stream: false,
      output_format: 'url',
      subtitle_enable: true,
      subtitle_type: 'word',
      voice_setting: { voice_id: voice, speed: Math.min(2, Math.max(0.5, speed)), vol: 1, pitch: 0 },
      audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
    }),
  });
  const json = await answer<{ base_resp?: { status_code?: number; status_msg?: string }; data?: { audio?: string; subtitle_file?: string } }>(response, 'MiniMax');
  if (json.base_resp?.status_code !== 0) throw new Error(`MiniMax refused the line: ${json.base_resp?.status_msg ?? 'no reason given'}.`);
  if (!json.data?.audio || !/^https:\/\//.test(json.data.audio)) throw new Error('MiniMax answered with no speech.');
  const audio = Buffer.from(await (await io.fetch(json.data.audio)).arrayBuffer());
  const subtitles = json.data.subtitle_file && /^https:\/\//.test(json.data.subtitle_file) ? await (await io.fetch(json.data.subtitle_file)).json() : null;
  return { audio, words: subtitles ? miniMaxWords(subtitles) : [] };
}

/** OpenAI's transcription words, as `verbose_json` with word timestamps gives them. */
export function openAiWords(transcript: { words?: { word: string; start: number; end: number }[] }): Word[] {
  return (transcript.words ?? []).filter((w) => w.word.trim()).map((w) => ({ text: w.word.trim(), start: round(w.start), end: round(w.end) }));
}

async function openAi(setup: VoiceSetup, voice: string, text: string, speed: number, io: VoiceIo): Promise<Speech> {
  const headers = { Authorization: `Bearer ${setup.key}` };
  const response = await io.fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: setup.model || 'gpt-4o-mini-tts', voice, input: text, speed: Math.min(4, Math.max(0.25, speed)), response_format: 'mp3' }),
  });
  if (!response.ok) throw new Error(`OpenAI answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const audio = Buffer.from(await response.arrayBuffer());
  // Its speech has no word times: one transcription of it, with word timestamps, gives them.
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'line.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const transcript = await answer<{ words?: { word: string; start: number; end: number }[] }>(
    await io.fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers, body: form }),
    'OpenAI',
  );
  return { audio, words: openAiWords(transcript) };
}

/** Speaks `text` in `voice` (the provider's own name for it) at `speed` (1 is its own pace) through the provider set up. */
export function speak(setup: VoiceSetup, voice: string, text: string, speed = 1, io: VoiceIo = NETWORK): Promise<Speech> {
  if (!text.trim()) throw new Error('A line with no words has nothing to say.');
  switch (setup.kind) {
    case 'azure':
      return azure(setup, voice, text, speed, io);
    case 'elevenlabs':
      return elevenLabs(setup, voice, text, speed, io);
    case 'minimax':
      return miniMax(setup, voice, text, speed, io);
    case 'openai':
      return openAi(setup, voice, text, speed, io);
  }
}

/** OpenAI's voices, which it does not list through its API. */
const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

/** The voices a provider offers the person, for Models' picker. */
export async function voicesOf(setup: VoiceSetup, io: VoiceIo = NETWORK): Promise<VoiceChoice[]> {
  switch (setup.kind) {
    case 'azure': {
      const list = await answer<{ ShortName: string; LocalName?: string; DisplayName?: string; Locale?: string; Gender?: string }[]>(
        await io.fetch(`https://${setup.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': setup.key } }),
        'Azure',
      );
      return list.map((v) => ({ id: v.ShortName, name: `${v.LocalName ?? v.DisplayName ?? v.ShortName}${v.Gender ? ` · ${v.Gender}` : ''}`, language: v.Locale }));
    }
    case 'elevenlabs': {
      const list = await answer<{ voices?: { voice_id: string; name: string; labels?: { language?: string } }[] }>(
        await io.fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': setup.key } }),
        'ElevenLabs',
      );
      return (list.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, language: v.labels?.language }));
    }
    case 'minimax': {
      const base = setup.region === 'china' ? 'https://api.minimaxi.com' : 'https://api.minimax.io';
      const list = await answer<{ system_voice?: { voice_id: string; voice_name?: string }[] }>(
        await io.fetch(`${base}/v1/get_voice`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${setup.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_type: 'system' }),
        }),
        'MiniMax',
      );
      return (list.system_voice ?? []).map((v) => ({ id: v.voice_id, name: v.voice_name ?? v.voice_id }));
    }
    case 'openai':
      return OPENAI_VOICES.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) }));
  }
}
