// The HyperFrames engine (ADR 0001): a HyperFrames project, HTML compositions animated by
// GSAP, run from its own node_modules, which the Studio never bundles. The preview is the
// project's own index.html, given HyperFrames' runtime from node_modules and the Studio's
// bridge (src/preview/hyperframes.ts); export is the project's own `hyperframes render`, given
// the Studio's ffmpeg. HyperFrames' usage telemetry is turned off for every command the
// Studio runs on the person's behalf.

import { type FSWatcher, existsSync, readFileSync, watch as watchFiles } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { BuildResult } from '../../shared/api';
import { STATE_DIR, ignore } from '../project';
import { ffmpegPath } from './capture';
import type { Bundler, Engine } from './engine';
import SKILL from './hyperframes.md?raw';
import { run } from './remotion';

const HYPERFRAMES = '0.9.28';
const GSAP = '3.15.0';
const RUNTIME = 'node_modules/hyperframes/dist/hyperframe.runtime.iife.js';

/** What the Studio's commands run with: the shipped ffmpeg, and no usage telemetry. */
const COMMAND_ENV = () => ({ HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_FFMPEG_PATH: ffmpegPath() });

export function isHyperFramesProject(dir: string): boolean {
  if (existsSync(join(dir, 'hyperframes.json'))) return true;
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: object; devDependencies?: object };
    return 'hyperframes' in (manifest.dependencies ?? {}) || 'hyperframes' in (manifest.devDependencies ?? {});
  } catch {
    return false;
  }
}

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="node_modules/gsap/dist/gsap.min.js"></script>
    <style>
      :root {
        --ground: #111;
        --ink: #fafafa;
        --font-display: system-ui, sans-serif;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: var(--ground);
      }
      #root {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display);
      }
      #title {
        color: var(--ink);
        font-size: 120px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1920" data-height="1080">
      <h1 id="title" class="clip" data-start="0" data-duration="6" data-track-index="0">A new film</h1>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo('#title', { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power2.out' }, 0.5);
      window.__timelines['main'] = tl;
    </script>
  </body>
</html>
`;

function manifest(dir: string): string {
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'film';
  return `${JSON.stringify(
    {
      name,
      private: true,
      scripts: { dev: 'hyperframes preview', check: 'hyperframes check', render: 'hyperframes render' },
      devDependencies: { '@motionhub/hyperframes': '0.2.0', gsap: GSAP, hyperframes: HYPERFRAMES },
    },
    null,
    2,
  )}\n`;
}

const SETTINGS = `${JSON.stringify({ paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' } }, null, 2)}\n`;

async function create(dir: string, log: (line: string) => void): Promise<void> {
  await writeFile(join(dir, 'package.json'), manifest(dir));
  await writeFile(join(dir, 'hyperframes.json'), SETTINGS);
  await writeFile(join(dir, 'index.html'), INDEX);
  await ignore(dir, ['node_modules/', 'renders/']);
  log('Installing HyperFrames with npm…');
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], dir, log);
}

/** Folders whose changes never change the film. */
const QUIET = new Set(['node_modules', '.git', STATE_DIR, 'renders']);

/**
 * A HyperFrames page needs no bundling: a change to any of the project's files is a new
 * version of the preview, reported once the changes settle.
 */
async function watch(dir: string, onBuilt: (result: BuildResult) => void): Promise<Bundler> {
  let version = 0;
  const report = () => {
    const errors = existsSync(join(dir, RUNTIME))
      ? existsSync(join(dir, 'index.html'))
        ? []
        : ['The project has no index.html.']
      : ['HyperFrames is not installed in this project: run npm install in its folder.'];
    onBuilt({ ok: errors.length === 0, version: ++version, errors });
  };
  let timer: NodeJS.Timeout | undefined;
  let watcher: FSWatcher | null = null;
  try {
    watcher = watchFiles(dir, { recursive: true }, (_event, file) => {
      if (file && QUIET.has(String(file).split(/[/\\]/)[0] ?? '')) return;
      clearTimeout(timer);
      timer = setTimeout(report, 150);
    });
  } catch (error) {
    // A system without recursive watching still previews; the agent's check rebuilds.
    console.warn(`Not watching ${dir}: ${(error as Error).message}`);
  }
  report();
  return {
    rebuild: async () => report(),
    dispose: async () => {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}

/** The project's index.html with HyperFrames' runtime ahead of its scripts and the Studio's bridge after them. */
async function page(dir: string, version: number): Promise<string> {
  const html = await readFile(join(dir, 'index.html'), 'utf8');
  const head = `<base href="/project/"><script src="/project/${RUNTIME}"></script>`;
  const bridge = `<script src="/studio/hyperframes.js?v=${version}"></script>`;
  const withHead = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`) : `${head}${html}`;
  return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>/i, `${bridge}</body>`) : `${withHead}${bridge}`;
}

/** The share of a `hyperframes render` done, from a line it prints, or null. */
export function renderProgress(line: string): number | null {
  if (!line.startsWith('@hf-progress ')) return null;
  try {
    const { pct } = JSON.parse(line.slice('@hf-progress '.length)) as { pct?: number };
    return typeof pct === 'number' ? Math.min(1, Math.max(0, pct / 100)) : null;
  } catch {
    return null;
  }
}

async function exportFilm(dir: string, _version: number, file: string, onProgress: (done: number) => void, signal: AbortSignal) {
  const bin = join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes');
  if (!existsSync(bin)) throw new Error('HyperFrames is not installed in this project: run npm install in its folder.');
  const partial = `${file}.partial.mp4`;
  try {
    await run(bin, ['render', '.', '--output', partial], dir, (line) => {
      const done = renderProgress(line);
      if (done !== null) onProgress(done);
    }, signal, COMMAND_ENV());
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
}

/** Turns the project's motions into assets/motion/ (motion.js, motion.css, fonts/), as @motionhub/hyperframes does. */
async function motionTaken(dir: string): Promise<void> {
  const bin = join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'motionhub-hyperframes.cmd' : 'motionhub-hyperframes');
  if (!existsSync(bin)) throw new Error('@motionhub/hyperframes is not installed in this project: run npm install in its folder.');
  await mkdir(join(dir, 'assets'), { recursive: true });
  await run(bin, ['--out', join('assets', 'motion')], dir, () => {}, undefined, COMMAND_ENV());
}

export const hyperframes: Engine = {
  id: 'hyperframes',
  detect: isHyperFramesProject,
  create,
  watch,
  page,
  exportFilm,
  motionTaken,
  skill: SKILL,
};

