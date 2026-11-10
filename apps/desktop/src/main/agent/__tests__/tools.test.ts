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
});
