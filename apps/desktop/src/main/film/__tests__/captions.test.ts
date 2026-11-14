import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { srt, srtTime } from '../captions';

const line = (id: string, text: string, start: number, end: number) => ({ id, text, start, end });
const scenes = [
  { id: 'a', start: 0, duration: 4, layers: [], lines: [line('l1', 'Heat moves uphill,', 0, 2), line('l2', 'if you push it.', 2, 4)] },
  { id: 'b', start: 4, duration: 3, layers: [], lines: [line('l3', '  ', 4, 5), line('l4', 'Seventy-two\nminutes.', 5, 7)] },
];

describe("a film's lines as subtitles", () => {
  it('times each cue as SubRip writes it', () => {
    expect(srtTime(0)).toBe('00:00:00,000');
    expect(srtTime(62.3456)).toBe('00:01:02,346');
    expect(srtTime(3723.5)).toBe('01:02:03,500');
  });

  it('is one cue for each line that says something, while it is said, and none for a film that says nothing', () => {
    expect(srt({ scenes })).toBe(
      [
        '1\n00:00:00,000 --> 00:00:02,000\nHeat moves uphill,\n',
        '2\n00:00:02,000 --> 00:00:04,000\nif you push it.\n',
        '3\n00:00:05,000 --> 00:00:07,000\nSeventy-two\nminutes.\n',
      ].join('\n'),
    );
    expect(srt({ scenes: [{ ...scenes[0]!, lines: [] }] })).toBeNull();
  });

  describe('in an MP4', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'oms-captions-'));
    });
    afterAll(() => rm(dir, { recursive: true, force: true }));

    it('is a subtitle track ffmpeg reads back cue for cue', async () => {
      const ffmpeg = ffmpegStatic!;
      const run = (args: string[]) =>
        new Promise<string>((done, fail) =>
          execFile(ffmpeg, ['-hide_banner', ...args], { timeout: 60_000, windowsHide: true }, (error, _out, stderr) =>
            error ? fail(new Error(String(stderr))) : done(String(stderr)),
          ),
        );
      await writeFile(join(dir, 'in.srt'), srt({ scenes })!);
      // The same mapping the export uses: the picture, then the subtitles as mov_text.
      await run(['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30:d=7', '-i', join(dir, 'in.srt'),
        '-map', '0:v', '-map', '1:s', '-c:v', 'libx264', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=und', join(dir, 'out.mp4')]);
      expect(await run(['-i', join(dir, 'out.mp4')]).catch((e: Error) => e.message)).toMatch(/Subtitle: mov_text/);
      await run(['-y', '-loglevel', 'error', '-i', join(dir, 'out.mp4'), '-map', '0:s', join(dir, 'back.srt')]);
      // ffmpeg writes the lines' ends as its platform does.
      const back = (await readFile(join(dir, 'back.srt'), 'utf8')).replace(/\r\n/g, '\n');
      expect(back).toContain('00:00:05,000 --> 00:00:07,000\nSeventy-two\nminutes.');
    }, 60_000);
  });
});
