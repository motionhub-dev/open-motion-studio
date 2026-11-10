import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engineOf } from '../engine';
import { hyperframes, isHyperFramesProject, renderProgress } from '../hyperframes';

vi.mock('electron', () => ({ app: {}, protocol: {}, session: {} }));

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'oms-hyperframes-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isHyperFramesProject', () => {
  it('knows a project by its hyperframes.json or the hyperframes package, ahead of the other engines', async () => {
    expect(isHyperFramesProject(dir)).toBe(false);
    await writeFile(join(dir, 'package.json'), JSON.stringify({ devDependencies: { hyperframes: '0.9.28', remotion: '4.0.0' } }));
    expect(engineOf(dir)?.id).toBe('hyperframes');
    await rm(join(dir, 'package.json'));
    await writeFile(join(dir, 'hyperframes.json'), '{}');
    expect(isHyperFramesProject(dir)).toBe(true);
  });
});

describe('page', () => {
  it('puts the runtime ahead of the page’s scripts and the bridge after them, resolving the page’s paths in the project', async () => {
    await writeFile(join(dir, 'index.html'), '<html><head lang="x"><script src="node_modules/gsap/dist/gsap.min.js"></script></head><body><script>t()</script></body></html>');
    const html = await hyperframes.page(dir, 7);
    expect(html).toBe(
      '<html><head lang="x"><base href="/project/"><script src="/project/node_modules/hyperframes/dist/hyperframe.runtime.iife.js"></script>' +
        '<script src="node_modules/gsap/dist/gsap.min.js"></script></head><body><script>t()</script>' +
        '<script src="/studio/hyperframes.js?v=7"></script><script src="/studio/pick.js"></script></body></html>',
    );
  });
});

describe('renderProgress', () => {
  it('reads the share done from the machine lines hyperframes render prints', () => {
    expect(renderProgress('@hf-progress {"code":"capture","done":5,"total":10,"pct":42}')).toBeCloseTo(0.42);
    expect(renderProgress('@hf-progress {"pct":120}')).toBe(1);
    expect(renderProgress('  ████ 42%  Capturing')).toBeNull();
    expect(renderProgress('@hf-progress {broken')).toBeNull();
  });
});
