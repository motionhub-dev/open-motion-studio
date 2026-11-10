// The native engine (docs/tech/architecture.md, "The engine contract"): a film is
// `film.tsx` at the project's root, a React component that draws by `useTime()` from
// @motionhub/runtime, as a motion's reel does, exporting its length and size:
//
//   export const film = {seconds: 12, width: 1920, height: 1080, fps: 30};
//   export default function Film() { ... }
//
// The Studio bundles it with esbuild into .motion-studio/build/film.js, leaving React and
// the runtime to the preview core (src/preview/core.tsx), and plays, stills and exports
// it from there.

import { type BuildContext, type Message, type Plugin, context, formatMessages } from 'esbuild';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATE_DIR } from '../project';

export const FILM = 'film.tsx';
/** Where a project's film is bundled to. A function, so this module reads STATE_DIR only once it is defined. */
export const buildDir = (dir: string): string => join(dir, STATE_DIR, 'build');

/** What the preview core provides; everything else a film imports is bundled. */
const PROVIDED = ['react', 'react/jsx-runtime', '@motionhub/runtime'];

/** Files a film may import, served beside its bundle. */
const ASSETS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav', '.ogg'];

export const isNativeProject = (dir: string): boolean => existsSync(join(dir, FILM));

const STARTER = `import {MotionRoot, interpolate, useTime} from '@motionhub/runtime';

/** The film's length and size. */
export const film = {seconds: 6, width: 1920, height: 1080, fps: 30};

export default function Film() {
  const t = useTime();
  const opacity = interpolate(t, [0.5, 1.5], [0, 1], {clamp: true});
  return (
    <MotionRoot style={{background: '#111', color: '#fafafa', display: 'grid', placeItems: 'center'}}>
      <h1 style={{fontFamily: 'system-ui, sans-serif', fontSize: 120, opacity}}>A new film</h1>
    </MotionRoot>
  );
}
`;

/** Starts a native film in the project: writes film.tsx unless there is one. */
export async function startFilm(dir: string): Promise<void> {
  const file = join(dir, FILM);
  if (existsSync(file)) return;
  await writeFile(file, STARTER);
}

export interface BuildResult {
  ok: boolean;
  /** Counts builds, so a page can ask for the bundle it was told about. */
  version: number;
  /** esbuild's errors, formatted as it prints them. */
  errors: string[];
}

const formatted = async (messages: Message[]): Promise<string[]> =>
  messages.length ? await formatMessages(messages, { kind: 'error', color: false }) : [];

/**
 * Bundles film.tsx and keeps it bundled: every change to a file it imports rebuilds it,
 * and `onBuilt` hears each result. Returns the context, to dispose when the project closes.
 */
export async function watchFilm(dir: string, onBuilt: (result: BuildResult) => void): Promise<BuildContext> {
  let version = 0;
  const report: Plugin = {
    name: 'report',
    setup(build) {
      build.onEnd(async (result) => {
        const errors = await formatted(result.errors);
        onBuilt({ ok: errors.length === 0, version: ++version, errors });
      });
    },
  };
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
    loader: Object.fromEntries(ASSETS.map((ext) => [ext, 'file' as const])),
    publicPath: 'build',
    sourcemap: 'inline',
    logLevel: 'silent',
    plugins: [report],
  });
  await ctx.watch();
  return ctx;
}
