// The film (docs/tech/architecture.md, "The film"): `film.tsx` at the project's root, a
// React component that draws a <Film> of <Scene>s from @motionhub/runtime, each of <Layer>s
// and <Line>s; the scenes' durations are its length, and `film` gives its size and rate:
//
//   export const film = {width: 1920, height: 1080, fps: 30};
//   export default function Main() { return <Film><Scene id="intro" duration={4}>…</Scene></Film>; }
//
// The Studio bundles it with esbuild into .motion-studio/build/film.js, leaving React and
// the runtime to the preview core (src/preview/core.tsx), and plays, stills and exports
// it from there.

import { type BuildContext, type Message, type Plugin, context, formatMessages } from 'esbuild';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BuildResult } from '../../shared/api';
import { STATE_DIR } from '../project';
import SKILL from './film.md?raw';

/** What the agent is told about making a film (film.md). */
export const FILM_SKILL: string = SKILL;

export const FILM = 'film.tsx';
/** Where a project's film is bundled to. A function, so this module reads STATE_DIR only once it is defined. */
export const buildDir = (dir: string): string => join(dir, STATE_DIR, 'build');

/** What the preview core provides; everything else a film imports is bundled. */
const PROVIDED = ['react', 'react/jsx-runtime', '@motionhub/runtime'];

/** The kinds of file a film may import, served beside its bundle. */
const ASSETS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav', '.ogg'];

/** Whether a folder holds a film. */
export const hasFilm = (dir: string): boolean => existsSync(join(dir, FILM));

const STARTER = `import {Film, Layer, Line, Scene, interpolate, useTime} from '@motionhub/runtime';

/** The film's size and rate; its scenes decide its length. */
export const film = {width: 1920, height: 1080, fps: 30};

function Title({children}: {children: string}) {
  const t = useTime();
  const opacity = interpolate(t, [0.3, 1.2], [0, 1], {clamp: true});
  return (
    <h1 style={{margin: 0, height: '100%', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 120, color: '#fafafa', opacity}}>
      {children}
    </h1>
  );
}

export default function Main() {
  return (
    <Film>
      <Layer id="ground">
        <div style={{width: '100%', height: '100%', background: '#111'}} />
      </Layer>
      <Scene id="opening" duration={3}>
        <Line id="opening-line">A new film.</Line>
        <Layer id="title" y={340} h={400}>
          <Title>A new film</Title>
        </Layer>
      </Scene>
      <Scene id="next" duration={3}>
        <Layer id="title" y={340} h={400}>
          <Title>Ask the agent for the rest</Title>
        </Layer>
      </Scene>
    </Film>
  );
}
`;

/** Starts a film in the project: writes film.tsx unless there is one. */
export async function startFilm(dir: string): Promise<void> {
  const file = join(dir, FILM);
  if (existsSync(file)) return;
  await writeFile(file, STARTER);
}

export const formatted = async (messages: Message[]): Promise<string[]> =>
  messages.length ? await formatMessages(messages, { kind: 'error', color: false }) : [];

/** An esbuild plugin that numbers each build and reports its errors to `onBuilt`. */
export function reporter(onBuilt: (result: BuildResult) => void): Plugin {
  let version = 0;
  return {
    name: 'report',
    setup(build) {
      build.onEnd(async (result) => {
        const errors = await formatted(result.errors);
        onBuilt({ ok: errors.length === 0, version: ++version, errors });
      });
    },
  };
}

/** Files a film may import, served beside its bundle. */
export const ASSET_LOADERS = Object.fromEntries(ASSETS.map((ext) => [ext, 'file' as const]));

/**
 * Bundles film.tsx and keeps it bundled: every change to a file it imports rebuilds it,
 * and `onBuilt` hears each result. Returns the context, to dispose when the project closes.
 */
export async function watchFilm(dir: string, onBuilt: (result: BuildResult) => void): Promise<BuildContext> {
  const ctx = await context({
    absWorkingDir: dir,
    entryPoints: [FILM],
    outfile: join(buildDir(dir), 'film.js'),
    bundle: true,
    format: 'iife',
    globalName: '__omsFilm',
    platform: 'browser',
    target: 'chrome130',
    jsx: 'automatic',
    external: PROVIDED,
    loader: ASSET_LOADERS,
    publicPath: 'build',
    sourcemap: 'inline',
    logLevel: 'silent',
    plugins: [reporter(onBuilt)],
  });
  await ctx.watch();
  return ctx;
}
