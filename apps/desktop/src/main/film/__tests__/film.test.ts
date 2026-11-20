import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildResult } from '../../../shared/api';
import { FILM, buildDir, hasFilm, startFilm, watchFilm } from '../film';

vi.mock('electron', () => ({}));

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oms-film-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Watches the project until `count` builds have been reported. */
async function builds(count: number, between?: (n: number) => Promise<void>): Promise<BuildResult[]> {
  const results: BuildResult[] = [];
  let next: () => void = () => {};
  const ctx = await watchFilm(root, (result) => {
    results.push(result);
    next();
  });
  try {
    while (results.length < count) {
      const n = results.length;
      if (n > 0 && between) await between(n);
      await new Promise<void>((done) => {
        next = done;
        if (results.length > n) done();
      });
    }
  } finally {
    await ctx.dispose();
  }
  return results;
}

describe('startFilm', () => {
  it('writes film.tsx once, and never over one the person has', async () => {
    expect(hasFilm(root)).toBe(false);
    await startFilm(root);
    expect(hasFilm(root)).toBe(true);
    await writeFile(join(root, FILM), 'mine');
    await startFilm(root);
    expect(await readFile(join(root, FILM), 'utf8')).toBe('mine');
  });
});

describe('watchFilm', () => {
  it('bundles the film, leaving React and the runtime to the preview core', async () => {
    await startFilm(root);
    const [result] = await builds(1);
    expect(result).toEqual({ ok: true, version: 1, errors: [] });
    const bundle = await readFile(join(buildDir(root), 'film.js'), 'utf8');
    expect(bundle).toContain('var __omsFilm');
    expect(bundle).toContain('require("@motionhub/runtime")');
    expect(bundle).toContain('require("react/jsx-runtime")');
    expect(bundle).not.toContain('react.production');
  });

  it('bundles three.js and its addons from the Studio, at the version motionhub pins, over a copy in the project', async () => {
    // A project's own node_modules/three, which a film must not pick up instead.
    await mkdir(join(root, 'node_modules', 'three'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'three', 'package.json'), '{"name":"three","main":"index.js"}');
    await writeFile(join(root, 'node_modules', 'three', 'index.js'), 'export const REVISION = "project";');
    await writeFile(
      join(root, FILM),
      `import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export const film = {width: 1280, height: 720};
export const parts = [THREE.REVISION, new RoundedBoxGeometry(1, 1, 1).type];
export default function Main() { return null; }
`,
    );
    const [result] = await builds(1);
    expect(result).toEqual({ ok: true, version: 1, errors: [] });
    const bundle = await readFile(join(buildDir(root), 'film.js'), 'utf8');
    expect(bundle).toContain('REVISION = "187"');
    expect(bundle).toContain('RoundedBoxGeometry');
    expect(bundle).not.toContain('require("three');
    expect(bundle).not.toContain('"project"');
  });

  it('refuses a package it does not provide and the project does not hold', async () => {
    await writeFile(join(root, FILM), "import lodash from 'lodash';\nexport default function Main() { return lodash; }\n");
    const [result] = await builds(1);
    expect(result?.ok).toBe(false);
    expect(result?.errors[0]).toContain('lodash');
  });

  it('reports an error, and the next build when it is fixed', async () => {
    await writeFile(join(root, FILM), 'export default function Film( {');
    const results = await builds(2, async () => {
      await writeFile(join(root, FILM), 'export const film = {width: 1280, height: 720};\nexport default function Main() { return null; }\n');
    });
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.errors[0]).toContain('film.tsx');
    expect(results[1]).toMatchObject({ ok: true, version: 2 });
  });
});
