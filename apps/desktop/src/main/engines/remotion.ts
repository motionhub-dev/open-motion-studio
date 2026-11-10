// The Remotion engine (ADR 0001): a Remotion project run from its own node_modules, which
// the Studio never bundles. The preview is the project's composition in @remotion/player on
// the Studio's preview page (remotion-preview.tsx.txt), bundled with esbuild; export is the
// project's own `remotion render`, so a film exports exactly as it would from a terminal,
// sound included. Remotion's licence is between the person and Remotion.
//
// A project lists its compositions in src/compositions.ts ({id, component, durationInFrames,
// fps, width, height, defaultProps?}), which src/Root.tsx registers: the Player needs the
// component itself, and the list is the one public way to reach it.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { context } from 'esbuild';
import type { BuildResult } from '../../shared/api';
import { STATE_DIR, ignore } from '../project';
import { openStage } from './capture';
import type { Engine } from './engine';
import { ASSET_LOADERS, buildDir, reporter } from './native';
import { htmlPage } from './preview';
import PREVIEW from './remotion-preview.tsx.txt?raw';
import SKILL from './remotion.md?raw';

/** The Remotion release a new project starts on; its packages must all be the same version. */
const REMOTION = '4.0.542';

export function isRemotionProject(dir: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: object; devDependencies?: object };
    return 'remotion' in (manifest.dependencies ?? {}) || 'remotion' in (manifest.devDependencies ?? {});
  } catch {
    return false;
  }
}

let toolPath: Promise<string> | null = null;

/**
 * The environment for the person's own tools (node, npm, the project's remotion). An app
 * started from the Dock or a launcher does not inherit the PATH a terminal has, so on macOS
 * and Linux it is read once from a login shell.
 */
export async function toolEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') return process.env;
  toolPath ??= new Promise((done) => {
    const shell = process.env.SHELL || '/bin/sh';
    const child = spawn(shell, ['-ilc', 'printf "__OMS__%s__OMS__" "$PATH"'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => child.kill(), 5000);
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => done(process.env.PATH ?? ''));
    child.on('close', () => {
      clearTimeout(timer);
      done(/__OMS__(.*)__OMS__/s.exec(out)?.[1] || process.env.PATH || '');
    });
  });
  return { ...process.env, PATH: await toolPath };
}

/** Runs a tool to its end in `dir`, `onLine` hearing each line it prints; rejects with its last lines. */
export async function run(
  command: string,
  args: string[],
  dir: string,
  onLine: (line: string) => void,
  signal?: AbortSignal,
  extraEnv: Record<string, string> = {},
): Promise<void> {
  const env = { ...(await toolEnv()), ...extraEnv };
  await new Promise<void>((done, fail) => {
    // Windows runs npm.cmd and a project's .cmd shims through its shell, which splits a path at its spaces.
    const windows = process.platform === 'win32';
    const quote = (part: string) => (windows && /[\s&()^%!"]/.test(part) ? `"${part.replace(/"/g, '""')}"` : part);
    const child = spawn(quote(command), args.map(quote), { cwd: dir, env, shell: windows, stdio: ['ignore', 'pipe', 'pipe'] });
    const tail: string[] = [];
    const take = (data: Buffer) => {
      for (const line of data.toString().split(/\r?\n|\r/)) {
        if (!line.trim()) continue;
        onLine(line);
        tail.push(line);
        if (tail.length > 12) tail.shift();
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const stop = () => child.kill();
    signal?.addEventListener('abort', stop, { once: true });
    child.on('error', (error) =>
      fail((error as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(`${command} was not found. Install Node.js (nodejs.org) and try again.`) : error),
    );
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) fail(new Error('Cancelled.'));
      else if (code === 0) done();
      else fail(new Error(`${command} ${args[0]} failed:\n${tail.join('\n')}`));
    });
  });
}

const npm = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const STARTER: Record<string, string> = {
  'src/index.ts': `import {registerRoot} from 'remotion';
import {Root} from './Root';

registerRoot(Root);
`,
  'src/Root.tsx': `import {Composition} from 'remotion';
import {compositions} from './compositions';

export const Root = () => (
  <>
    {compositions.map((c) => (
      <Composition key={c.id} {...c} />
    ))}
  </>
);
`,
  'src/compositions.ts': `import {Film} from './Film';

/** The film's compositions. Root registers each, and Open Motion Studio previews them from this list. */
export const compositions = [
  {id: 'Film', component: Film, durationInFrames: 180, fps: 30, width: 1920, height: 1080},
];
`,
  'src/Film.tsx': `import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const Film = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [15, 45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#111', color: '#fafafa', justifyContent: 'center', alignItems: 'center'}}>
      <h1 style={{fontFamily: 'system-ui, sans-serif', fontSize: 120, opacity}}>A new film</h1>
    </AbsoluteFill>
  );
};
`,
  'tsconfig.json': `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
      },
      include: ['src', 'motions'],
    },
    null,
    2,
  )}\n`,
};

function manifest(dir: string): string {
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'film';
  return `${JSON.stringify(
    {
      name,
      private: true,
      scripts: { studio: 'remotion studio', render: 'remotion render' },
      dependencies: {
        '@motionhub/remotion': '0.2.0',
        '@motionhub/runtime': '0.3.0',
        '@remotion/cli': REMOTION,
        '@remotion/player': REMOTION,
        react: '19.3.1',
        'react-dom': '19.3.1',
        remotion: REMOTION,
      },
    },
    null,
    2,
  )}\n`;
}

async function create(dir: string, log: (line: string) => void): Promise<void> {
  await writeFile(join(dir, 'package.json'), manifest(dir));
  for (const [path, text] of Object.entries(STARTER)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  await ignore(dir, ['node_modules/', 'out/']);
  log('Installing Remotion with npm…');
  await run(npm(), ['install', '--no-audit', '--no-fund'], dir, log);
}

/** Where the preview page's entry is written, inside the Studio's state. */
const entryDir = (dir: string) => join(dir, STATE_DIR, 'remotion');

async function watch(dir: string, onBuilt: (result: BuildResult) => void) {
  await mkdir(entryDir(dir), { recursive: true });
  await writeFile(join(entryDir(dir), 'preview.tsx'), PREVIEW);
  // Remotion's staticFile() prefixes this, so public/ files are served by the preview scheme.
  await writeFile(join(entryDir(dir), 'static-base.ts'), "(window as {remotion_staticBase?: string}).remotion_staticBase = '/project/public';\n");
  const ctx = await context({
    absWorkingDir: dir,
    entryPoints: [join(entryDir(dir), 'preview.tsx')],
    outfile: join(buildDir(dir), 'preview.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome130',
    jsx: 'automatic',
    loader: ASSET_LOADERS,
    publicPath: 'build',
    define: { 'process.env.NODE_ENV': '"production"' },
    sourcemap: 'inline',
    logLevel: 'silent',
    plugins: [reporter(onBuilt)],
  });
  await ctx.watch();
  return ctx;
}

/** The share of a `remotion render` done, from a line it prints, or null. Rendering is most of the work. */
export function renderProgress(line: string): number | null {
  const rendered = /Rendered (\d+)\/(\d+)/.exec(line);
  if (rendered) return (0.9 * Number(rendered[1])) / Number(rendered[2]);
  const encoded = /Encoded (\d+)\/(\d+)/.exec(line);
  if (encoded) return 0.9 + (0.1 * Number(encoded[1])) / Number(encoded[2]);
  return null;
}

async function exportFilm(dir: string, version: number, file: string, onProgress: (done: number) => void, signal: AbortSignal) {
  // The composition the preview shows is the one exported.
  const stage = await openStage(version);
  const composition = stage.film.composition;
  stage.close();
  if (!composition) throw new Error('The preview named no composition.');
  const bin = join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'remotion.cmd' : 'remotion');
  if (!existsSync(bin)) throw new Error('Remotion is not installed in this project: run npm install in its folder.');
  const partial = `${file}.partial.mp4`;
  try {
    await run(bin, ['render', 'src/index.ts', composition, partial, '--overwrite'], dir, (line) => {
      const done = renderProgress(line);
      if (done !== null) onProgress(done);
    }, signal);
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
}

export const remotion: Engine = {
  id: 'remotion',
  detect: isRemotionProject,
  create,
  watch,
  page: async (_dir, version) => htmlPage(`<div id="root" style="width:100%;height:100%"></div><script src="build/preview.js?v=${version}"></script><script src="studio/pick.js"></script>`),
  exportFilm,
  motionTaken: async () => {},
  skill: SKILL,
};
