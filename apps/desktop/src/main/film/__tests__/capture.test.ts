import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENE_STILLS, type Stage, sceneStills, stillsDir } from '../capture';
import { buildDir } from '../film';
import type { FilmInfo } from '../../../shared/preview';

vi.mock('electron', () => ({}));

const film = {
  width: 1920,
  height: 1080,
  fps: 30,
  seconds: 6,
  scenes: [
    { id: 'intro', start: 0, duration: 4, layers: [], lines: [] },
    { id: 'outro', start: 4, duration: 2, layers: [], lines: [] },
  ],
  layers: [],
} as unknown as FilmInfo;

/** A stage that photographs nothing: each frame is the time it was asked for. */
function fakeStage() {
  const times: number[] = [];
  const stage: Stage = {
    film,
    frame: async (t) => {
      times.push(t);
      const bytes = Buffer.from(`frame at ${t}`);
      return { resize: () => ({ toJPEG: () => bytes }) } as never;
    },
    close: vi.fn(),
  };
  return { stage, times, open: vi.fn(async () => stage) };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-stills-'));
  await mkdir(buildDir(dir), { recursive: true });
  await writeFile(join(buildDir(dir), 'film-1.js'), 'the first film');
  await writeFile(join(buildDir(dir), 'film-2.js'), 'the second film');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the scenes photographed for the timeline', () => {
  it('takes each scene evenly through it, and closes the stage', async () => {
    const { open, times, stage } = fakeStage();
    const stills = await sceneStills(dir, 1, open);
    expect(Object.keys(stills)).toEqual(['intro', 'outro']);
    expect(stills.intro).toHaveLength(SCENE_STILLS);
    expect(stills.intro![0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(times.slice(0, SCENE_STILLS)).toEqual([1 / 3, 1, 5 / 3, 7 / 3, 3, 11 / 3]);
    expect(times[SCENE_STILLS]).toBeCloseTo(4 + 1 / 6);
    expect(stage.close).toHaveBeenCalled();
  });

  it('keeps one file, in .motion-studio/thumbs, and photographs the same build only once', async () => {
    const first = fakeStage();
    const stills = await sceneStills(dir, 1, first.open);
    expect(await readdir(stillsDir(dir))).toEqual([expect.stringMatching(/^[0-9a-f]{16}\.json$/)]);
    expect(stillsDir(dir)).toBe(join(dir, '.motion-studio', 'thumbs'));

    const again = fakeStage();
    expect(await sceneStills(dir, 1, again.open)).toEqual(stills);
    expect(again.open).not.toHaveBeenCalled();
  });

  it('a new build replaces the last one’s file and touches nothing else', async () => {
    await sceneStills(dir, 1, fakeStage().open);
    const [old] = await readdir(stillsDir(dir));
    await sceneStills(dir, 2, fakeStage().open);
    const kept = await readdir(stillsDir(dir));
    expect(kept).toHaveLength(1);
    expect(kept[0]).not.toBe(old);
    expect((await readdir(buildDir(dir))).sort()).toEqual(['film-1.js', 'film-2.js']);
  });

  it('writes nothing when the film fails to draw', async () => {
    const { stage } = fakeStage();
    stage.frame = async () => {
      throw new Error('The frame at 1.00 s took longer than 60 s.');
    };
    await expect(sceneStills(dir, 1, async () => stage)).rejects.toThrow('took longer');
    expect(stage.close).toHaveBeenCalled();
    await expect(readdir(stillsDir(dir))).rejects.toThrow();
  });
});
