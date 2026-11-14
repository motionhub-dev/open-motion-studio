import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ToolContext, projectPath, runTool } from '../tools';

vi.mock('electron', () => ({}));

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-tools-'));
  ctx = {
    dir,
    build: vi.fn(),
    stage: vi.fn(),
    searchMotions: vi.fn(),
    useMotion: vi.fn(),
    voiceKinds: vi.fn(),
    voiceChoices: vi.fn(),
    voiceFilm: vi.fn(),
  };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('projectPath', () => {
  it('keeps every path inside the project', () => {
    for (const path of ['../x', '/etc/passwd', 'parts/../../x', '']) {
      expect(() => projectPath(dir, path, false)).toThrow();
    }
    expect(projectPath(dir, 'parts/title.tsx', false)).toBe(join(dir, 'parts', 'title.tsx'));
  });

  it('never lets the agent write the Studio’s state, a motion from motionhub, dependencies or git', () => {
    for (const path of ['.motion-studio/session.json', 'motions/@iamsuosi/plumb-line/tokens.json', 'node_modules/x.js', '.git/config']) {
      expect(() => projectPath(dir, path, true)).toThrow();
      expect(() => projectPath(dir, path, false)).not.toThrow();
    }
    expect(projectPath(dir, 'motions/house/tokens.json', true)).toBe(join(dir, 'motions', 'house', 'tokens.json'));
  });

  it('refuses them in any case, since macOS and Windows file systems ignore it', () => {
    for (const path of ['.GIT/hooks/pre-commit', '.Motion-Studio/history.json', 'Node_Modules/x.js', 'Motions/@iamsuosi/plumb-line/tokens.json']) {
      expect(() => projectPath(dir, path, true)).toThrow();
    }
  });
});

describe('runTool', () => {
  it('writes, edits and reads a file', async () => {
    expect((await runTool('write_file', { path: 'parts/a.tsx', content: 'one two' }, ctx)).ok).toBe(true);
    expect((await runTool('edit_file', { path: 'parts/a.tsx', old_text: 'two', new_text: '$& three' }, ctx)).ok).toBe(true);
    expect(await readFile(join(dir, 'parts', 'a.tsx'), 'utf8')).toBe('one $& three');
    expect(await runTool('read_file', { path: 'parts/a.tsx' }, ctx)).toMatchObject({ ok: true, text: 'one $& three' });
  });

  it('refuses an edit whose passage is not there exactly once', async () => {
    await writeFile(join(dir, 'film.tsx'), 'a a');
    expect(await runTool('edit_file', { path: 'film.tsx', old_text: 'a', new_text: 'b' }, ctx)).toMatchObject({ ok: false });
    expect(await runTool('edit_file', { path: 'film.tsx', old_text: 'c', new_text: 'b' }, ctx)).toMatchObject({ ok: false });
  });

  it('answers a mistake with a failed outcome the model can read, never a throw', async () => {
    expect(await runTool('write_file', { path: '../escape.txt', content: 'x' }, ctx)).toMatchObject({ ok: false });
    expect(await runTool('read_file', { path: 'missing.txt' }, ctx)).toMatchObject({ ok: false });
    expect(await runTool('nothing', {}, ctx)).toMatchObject({ ok: false });
  });

  it('refuses to run a call whose arguments were not JSON', async () => {
    const outcome = await runTool('write_file', { invalid_arguments: '{"path": "fi' }, ctx);
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.text).toContain('not valid JSON');
  });

  it('lists the project without its dependencies or the Studio’s state', async () => {
    await mkdir(join(dir, 'node_modules', 'react'), { recursive: true });
    await mkdir(join(dir, '.motion-studio'), { recursive: true });
    await writeFile(join(dir, 'node_modules', 'react', 'index.js'), '');
    await writeFile(join(dir, '.motion-studio', 'session.json'), '');
    await writeFile(join(dir, 'film.tsx'), '');
    expect((await runTool('list_files', {}, ctx)).text).toBe('film.tsx');
  });

  it('reports a film that does not build without photographing it', async () => {
    ctx.build = vi.fn().mockResolvedValue({ ok: false, version: 3, errors: ['film.tsx:1:1: ERROR: oops'] });
    const outcome = await runTool('still', { time: 1 }, ctx);
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.text).toContain('oops');
    expect(ctx.stage).not.toHaveBeenCalled();
  });

  it('checks a film of scenes in the middle of each, and outlines them', async () => {
    const frame = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const scenes = [
      { id: 'intro', start: 0, duration: 4, layers: [{ id: 'title', x: 0, y: 300, w: 1920, h: 400, z: 0 }], lines: [{ id: 'l1', text: 'Heat moves uphill.', start: 0.5, end: 3 }] },
      { id: 'how', start: 4, duration: 6, layers: [], lines: [] },
    ];
    ctx.build = vi.fn().mockResolvedValue({ ok: true, version: 2, errors: [] });
    ctx.stage = vi.fn().mockResolvedValue({ film: { seconds: 10, width: 1920, height: 1080, fps: 30, scenes, layers: [], sounds: [] }, frame, close });
    const outcome = await runTool('check', {}, ctx);
    expect(frame.mock.calls.map(([t]) => t)).toEqual([0, 2, 7, 10 - 1 / 30]);
    expect(outcome.text).toBe(
      [
        'The film builds and draws: 10 s at 1920×1080, 30 fps, in 2 scenes:',
        '- intro, 0 to 4 s: title (0,300 1920×400); says "Heat moves uphill." (0.5–3 s)',
        '- how, 4 to 10 s: no layers',
      ].join('\n'),
    );
    expect(close).toHaveBeenCalled();
  });

  it('reports each sound, and fails while one plays a file the project does not have', async () => {
    await mkdir(join(dir, 'media'));
    await writeFile(join(dir, 'media', 'bed.mp3'), 'sound');
    const sound = { at: 0, dur: null, until: 4, trim: 0, loop: false, volume: 0, fadeIn: 0, fadeOut: 0 };
    const sounds = [
      { ...sound, src: 'media/bed.mp3', loop: true, volume: -12, fadeIn: 1, fadeOut: 2 },
      { ...sound, src: 'media/hit.wav', at: 1.5, dur: 0.5, volume: -6 },
    ];
    const scenes = [{ id: 'intro', start: 0, duration: 4, layers: [], lines: [] }];
    ctx.build = vi.fn().mockResolvedValue({ ok: true, version: 2, errors: [] });
    const film = (heard: typeof sounds) => ({ film: { seconds: 4, width: 1920, height: 1080, fps: 30, scenes, layers: [], sounds: heard }, frame: vi.fn(), close: vi.fn() });
    ctx.stage = vi.fn().mockResolvedValue(film(sounds));
    const failed = await runTool('check', {}, ctx);
    expect(failed.ok).toBe(false);
    expect(failed.text.split('\n').slice(2)).toEqual([
      'Sounds:',
      '- media/bed.mp3: 0 to 4 s, looped, at -12 dB, fading in over 1 s and out over 2 s',
      '- media/hit.wav: 1.5 to 2 s, at -6 dB',
      'But:',
      '<Sound src="media/hit.wav">: no such file in the project. A sound\'s src is a path in the project, as media/music.mp3.',
    ]);
    ctx.stage = vi.fn().mockResolvedValue(film(sounds.slice(0, 1)));
    expect((await runTool('check', {}, ctx)).ok).toBe(true);
  });

  it('says which lines are not yet spoken in the film’s voice, and which are cut short', async () => {
    const lines = [
      { id: 'l1', text: 'Heat moves uphill.', start: 0.4, end: 2, voiced: true as const, words: [], over: 0.62 },
      { id: 'l2', text: 'If you push it.', start: 2, end: 4 },
    ];
    const scenes = [{ id: 'intro', start: 0, duration: 4, layers: [], lines }];
    ctx.build = vi.fn().mockResolvedValue({ ok: true, version: 2, errors: [] });
    ctx.stage = vi.fn().mockResolvedValue({
      film: { seconds: 4, width: 1920, height: 1080, fps: 30, scenes, layers: [], sounds: [], voice: 'azure:en-US-AvaNeural' },
      frame: vi.fn(),
      close: vi.fn(),
    });
    const outcome = await runTool('check', {}, ctx);
    expect(outcome.ok).toBe(true);
    expect(outcome.text.split('\n').slice(1)).toEqual([
      '- intro, 0 to 4 s: no layers; says "Heat moves uphill." (0.4–2 s, voiced) "If you push it." (2–4 s)',
      'Narration:',
      '- Not yet spoken in azure:en-US-AvaNeural: "If you push it.". voice_lines speaks them.',
      '- "Heat moves uphill." is cut 0.6 s short by what follows it: give it more room, or fewer words.',
    ]);
  });
});

describe('voices', () => {
  it('lists the voices of the providers set up, narrowed to a language, as a film names them', async () => {
    ctx.voiceKinds = vi.fn().mockResolvedValue(['azure', 'openai']);
    ctx.voiceChoices = vi.fn(async (kind) =>
      kind === 'azure'
        ? [
            { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 · Female', language: 'zh-CN' },
            { id: 'en-US-AvaNeural', name: 'Ava · Female', language: 'en-US' },
          ]
        : [{ id: 'nova', name: 'Nova' }],
    );
    const outcome = await runTool('list_voices', { language: 'zh' }, ctx);
    expect(outcome.text.split('\n')).toEqual(['azure: 1 voice', '- azure:zh-CN-XiaoxiaoNeural (晓晓 · Female, zh-CN)', 'openai: 1 voice', '- openai:nova (Nova)']);
    expect((await runTool('list_voices', { provider: 'minimax' }, ctx)).ok).toBe(false);
  });

  it('asks for a provider to be set up before any voice is listed', async () => {
    ctx.voiceKinds = vi.fn().mockResolvedValue([]);
    const outcome = await runTool('list_voices', {}, ctx);
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain('Models, under Voices');
    expect(ctx.voiceChoices).not.toHaveBeenCalled();
  });

  it('voices the film and says what it spoke, or why it could not', async () => {
    ctx.voiceFilm = vi.fn().mockResolvedValueOnce({ spoken: 2, kept: 1, characters: 33, seconds: 3.42 });
    expect((await runTool('voice_lines', {}, ctx)).text).toBe('Spoke 2 lines (33 characters, 3.4 s); kept 1. The film is built again with them: check it.');
    ctx.voiceFilm = vi.fn().mockRejectedValue(new Error('Azure is not set up: add it in Models, under Voices.'));
    expect(await runTool('voice_lines', {}, ctx)).toMatchObject({ ok: false, text: 'Azure is not set up: add it in Models, under Voices.' });
  });
});
