import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engineOf } from '../engine';
import { isRemotionProject, renderProgress } from '../remotion';

vi.mock('electron', () => ({ app: {}, protocol: {}, session: {} }));

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-remotion-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isRemotionProject', () => {
  it('knows a project by remotion among its dependencies', async () => {
    expect(isRemotionProject(dir)).toBe(false);
    await writeFile(join(dir, 'package.json'), JSON.stringify({ devDependencies: { remotion: '4.0.0' } }));
    expect(isRemotionProject(dir)).toBe(true);
    await writeFile(join(dir, 'package.json'), '{not json');
    expect(isRemotionProject(dir)).toBe(false);
  });

  it('is matched before native, since a Remotion project may hold a film.tsx', async () => {
    await writeFile(join(dir, 'film.tsx'), '');
    expect(engineOf(dir)?.id).toBe('native');
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { remotion: '4.0.542' } }));
    expect(engineOf(dir)?.id).toBe('remotion');
  });
});

describe('renderProgress', () => {
  it('reads the share done from what remotion render prints, rendering first and encoding last', () => {
    expect(renderProgress('Rendered 90/180, time remaining: 2s')).toBeCloseTo(0.45);
    expect(renderProgress('Rendered 180/180')).toBeCloseTo(0.9);
    expect(renderProgress('Encoded 90/180')).toBeCloseTo(0.95);
    expect(renderProgress('+ out.mp4 46.7 kB')).toBeNull();
  });
});
