import { describe, expect, it, vi } from 'vitest';
import { type SocketLike, type VoiceIo, azureAudio, azureWords, groupWords, miniMaxWords, openAiWords, speak, voicesOf } from '../voice';

vi.mock('electron', () => ({}));

/** A fetch that answers each call in turn, and keeps what it was asked. */
function answers(...replies: (object | ArrayBuffer | string)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift();
    if (reply instanceof ArrayBuffer) return new Response(reply);
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('the words of a provider’s answer', () => {
  it('groups characters at the blanks, and keeps each character of text written without spaces', () => {
    const at = (text: string, i: number) => ({ text, start: i / 10, end: (i + 1) / 10 });
    expect(groupWords([at('H', 0), at('i', 1), at(' ', 2), at('y', 3), at('o', 4), at('u', 5)])).toEqual([
      { text: 'Hi', start: 0, end: 0.2 },
      { text: 'you', start: 0.3, end: 0.6 },
    ]);
    expect(groupWords([at('热', 0), at('量', 1), at('，', 2)]).map((w) => w.text)).toEqual(['热', '量', '，']);
  });

  it('reads Azure’s word boundaries, in 100-ns ticks, and its binary frames’ audio', () => {
    expect(
      azureWords(
        JSON.stringify({
          Metadata: [
            { Type: 'WordBoundary', Data: { Offset: 1_000_000, Duration: 3_000_000, text: { Text: 'Heat' } } },
            { Type: 'SentenceBoundary', Data: { Offset: 0, Duration: 0, text: { Text: 'Heat moves.' } } },
            { Type: 'WordBoundary', Data: { Offset: 5_000_000, Duration: 4_000_000, text: { Text: 'moves' } } },
          ],
        }),
      ),
    ).toEqual([
      { text: 'Heat', start: 0.1, end: 0.4 },
      { text: 'moves', start: 0.5, end: 0.9 },
    ]);
    const headers = Buffer.from('X-RequestId:1\r\nPath:audio\r\n');
    const frame = Buffer.concat([Buffer.from([0, headers.length]), headers, Buffer.from('MP3')]);
    expect(azureAudio(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.length) as ArrayBuffer)).toEqual({ path: 'audio', audio: Buffer.from('MP3') });
  });

  it('reads MiniMax’s subtitles and OpenAI’s transcription into the same words', () => {
    expect(
      miniMaxWords([
        { timestamped_words: [{ word: 'Heat', time_begin: 0, time_end: 300 }, { word: ' ', time_begin: 300, time_end: 350 }, { word: 'mo', time_begin: 350, time_end: 500 }, { word: 'ves', time_begin: 500, time_end: 700 }] },
      ]),
    ).toEqual([
      { text: 'Heat', start: 0, end: 0.3 },
      { text: 'moves', start: 0.35, end: 0.7 },
    ]);
    expect(openAiWords({ words: [{ word: ' Heat', start: 0.04, end: 0.38 }, { word: '', start: 0.4, end: 0.4 }] })).toEqual([{ text: 'Heat', start: 0.04, end: 0.38 }]);
  });
});

describe('speaking a line', () => {
  it('through ElevenLabs: its key, the voice and a speed within its range, and its characters as words', async () => {
    const { fetch, calls } = answers({
      audio_base64: Buffer.from('MP3').toString('base64'),
      alignment: { characters: ['H', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.25] },
    });
    const speech = await speak({ kind: 'elevenlabs', key: 'xi-key' }, 'voice-1', 'Hi', 2, { fetch } as unknown as VoiceIo);
    expect(speech).toEqual({ audio: Buffer.from('MP3'), words: [{ text: 'Hi', start: 0, end: 0.25 }] });
    expect(calls[0]!.url).toContain('/v1/text-to-speech/voice-1/with-timestamps');
    expect((calls[0]!.init!.headers as Record<string, string>)['xi-api-key']).toBe('xi-key');
    expect(JSON.parse(String(calls[0]!.init!.body)).voice_settings.speed).toBe(1.2);
  });

  it('through MiniMax: its group id, its site, the audio and subtitles fetched from its links', async () => {
    const { fetch, calls } = answers(
      { base_resp: { status_code: 0 }, data: { audio: 'https://cdn.example/a.mp3', subtitle_file: 'https://cdn.example/s.json' } },
      bytes('MP3'),
      [{ timestamped_words: [{ word: '你', time_begin: 0, time_end: 200 }, { word: '好', time_begin: 200, time_end: 400 }] }],
    );
    const speech = await speak({ kind: 'minimax', key: 'mm', groupId: 'g1', region: 'china' }, 'female-shaonv', '你好', 1, { fetch } as unknown as VoiceIo);
    expect(calls[0]!.url).toBe('https://api.minimaxi.com/v1/t2a_v2?GroupId=g1');
    expect(speech.audio.toString()).toBe('MP3');
    expect(speech.words.map((w) => w.text)).toEqual(['你', '好']);
    await expect(speak({ kind: 'minimax', key: 'mm' }, 'v', 'x', 1, { fetch } as unknown as VoiceIo)).rejects.toThrow('group id');
    const refused = answers({ base_resp: { status_code: 1004, status_msg: 'invalid api key' } });
    await expect(speak({ kind: 'minimax', key: 'bad', groupId: 'g' }, 'v', 'x', 1, refused as unknown as VoiceIo)).rejects.toThrow('invalid api key');
  });

  it('through OpenAI: its speech, then one transcription of it for the words', async () => {
    const { fetch, calls } = answers(bytes('MP3'), { words: [{ word: 'Heat', start: 0, end: 0.4 }] });
    const speech = await speak({ kind: 'openai', key: 'sk' }, 'nova', 'Heat', 1, { fetch } as unknown as VoiceIo);
    expect(speech.words).toEqual([{ text: 'Heat', start: 0, end: 0.4 }]);
    expect(calls.map((c) => c.url)).toEqual(['https://api.openai.com/v1/audio/speech', 'https://api.openai.com/v1/audio/transcriptions']);
    const form = calls[1]!.init!.body as FormData;
    expect(form.get('timestamp_granularities[]')).toBe('word');
    expect(form.get('response_format')).toBe('verbose_json');
  });

  it('through Azure: its WebSocket with the key, the SSML in the voice’s language, until the turn ends', async () => {
    const sent: string[] = [];
    let opened: { url: string; headers?: Record<string, string> } | null = null;
    class Socket implements SocketLike {
      binaryType = '';
      onopen: SocketLike['onopen'] = null;
      onmessage: SocketLike['onmessage'] = null;
      onerror: SocketLike['onerror'] = null;
      onclose: SocketLike['onclose'] = null;
      constructor(url: string, init?: { headers?: Record<string, string> }) {
        opened = { url, headers: init?.headers };
        setTimeout(() => this.onopen?.());
      }
      send(data: string) {
        sent.push(data);
        if (!data.includes('Path:ssml')) return;
        const headers = Buffer.from('Path:audio\r\n');
        const frame = Buffer.concat([Buffer.from([0, headers.length]), headers, Buffer.from('MP3')]);
        setTimeout(() => {
          this.onmessage?.({ data: 'Path:turn.start\r\n\r\n{}' });
          this.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.length) as ArrayBuffer });
          this.onmessage?.({
            data: `Path:audio.metadata\r\n\r\n${JSON.stringify({ Metadata: [{ Type: 'WordBoundary', Data: { Offset: 0, Duration: 2_000_000, text: { Text: '热' } } }] })}`,
          });
          this.onmessage?.({ data: 'Path:turn.end\r\n\r\n' });
        });
      }
      close() {}
    }
    const speech = await speak({ kind: 'azure', key: 'az-key', region: 'eastasia' }, 'zh-CN-XiaoxiaoNeural', '热 & 冷', 1.25, { WebSocket: Socket } as unknown as VoiceIo);
    expect(speech).toEqual({ audio: Buffer.from('MP3'), words: [{ text: '热', start: 0, end: 0.2 }] });
    expect(opened!.url).toMatch(/^wss:\/\/eastasia\.tts\.speech\.microsoft\.com\/cognitiveservices\/websocket\/v1\?X-ConnectionId=/);
    expect(opened!.headers).toEqual({ 'Ocp-Apim-Subscription-Key': 'az-key' });
    const ssml = sent.find((m) => m.includes('Path:ssml'))!;
    expect(ssml).toContain("xml:lang='zh-CN'");
    expect(ssml).toContain("<voice name='zh-CN-XiaoxiaoNeural'><prosody rate='+25%'>热 &amp; 冷</prosody>");
    expect(sent.find((m) => m.includes('Path:synthesis.context'))).toContain('"wordBoundaryEnabled":true');
    expect(() => speak({ kind: 'azure', key: 'k', region: 'East Asia' }, 'v', 'x', 1)).toThrow('region');
  });

  it('refuses a line with no words', () => {
    expect(() => speak({ kind: 'openai', key: 'k' }, 'nova', '  ')).toThrow('no words');
  });
});

describe('the voices a provider offers', () => {
  it('as Models lists them', async () => {
    const azure = answers([{ ShortName: 'zh-CN-XiaoxiaoNeural', LocalName: '晓晓', Locale: 'zh-CN', Gender: 'Female' }]);
    expect(await voicesOf({ kind: 'azure', key: 'k', region: 'eastasia' }, azure as unknown as VoiceIo)).toEqual([
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 · Female', language: 'zh-CN' },
    ]);
    expect((await voicesOf({ kind: 'openai', key: 'k' })).map((v) => v.id)).toContain('nova');
  });
});
