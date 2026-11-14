// Stills and export: the film's page opened with ?render=1 in an
// offscreen window, moved to each frame's time and photographed. Export pipes the frames
// to ffmpeg as H.264 (High, level 4.1, BT.709, a key frame every two seconds, the index
// ahead of the frames), which any phone plays, with the film's sounds mixed beside them
// as AAC (mix.ts). Nothing in the film runs on a clock, so a time always draws the same frame.

import { BrowserWindow, app, session, type NativeImage } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { keepFilmsInPlace, PREVIEW_URL, servePreview } from './preview';
import type { Box, FilmInfo } from '../../shared/preview';
import type { SceneStills } from '../../shared/api';
import { STATE_DIR } from '../project';
import { buildDir } from './film';
import { soundInputs, soundMix } from './mix';

export const RENDER_PARTITION = 'oms-render';

/** How long the page may take to load, or a frame to draw, before the render gives up. */
const FRAME_MS = 60_000;

const VIDEO = [
  '-vf',
  'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-color_range',
  'tv',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '20',
  '-profile:v',
  'high',
  '-level:v',
  '4.1',
];

/** The ffmpeg shipped with the app; inside a package it is unpacked beside the archive. */
export function ffmpegPath(): string {
  if (!ffmpegStatic) throw new Error('No ffmpeg is available for this platform.');
  return app.isPackaged ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : ffmpegStatic;
}

/** Serves the render partition's oms-preview: scheme from the open project. Call once, when the app is ready. */
export function serveRenders(film: () => string | null): void {
  servePreview(session.fromPartition(RENDER_PARTITION), film);
}

function timeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(new Error(`${what} took longer than ${FRAME_MS / 1000} s.`)), FRAME_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** A film opened still, ready to be photographed at any time; close() when done. */
export interface Stage {
  film: FilmInfo;
  /** The frame at `t`; with a box, outlined in red where the person marked it. */
  frame(t: number, box?: Box): Promise<NativeImage>;
  close(): void;
}

/** Opens the film of build `version` for photographing. Rejects with the page's own error when it fails. */
export async function openStage(version: number): Promise<Stage> {
  const window = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    webPreferences: { offscreen: true, partition: RENDER_PARTITION, sandbox: true, contextIsolation: true },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  keepFilmsInPlace(contents);
  const failed = async (): Promise<string | null> => (await contents.executeJavaScript('window.__omsError ?? null')) as string | null;
  try {
    await timeout(contents.loadURL(`${PREVIEW_URL}?render=1&v=${version}`), 'Loading the film');
    const film = await timeout(
      (async () => {
        for (;;) {
          const error = await failed();
          if (error) throw new Error(error);
          const info = (await contents.executeJavaScript(
            'window.__oms ? {seconds: __oms.seconds, width: __oms.width, height: __oms.height, fps: __oms.fps, scenes: __oms.scenes, layers: __oms.layers, sounds: __oms.sounds} : null',
          )) as FilmInfo | null;
          if (info) return info;
          await new Promise((done) => setTimeout(done, 50));
        }
      })(),
      'Starting the film',
    );
    window.setContentSize(film.width, film.height);
    await contents.executeJavaScript('document.fonts.ready.then(() => true)');
    return {
      film,
      async frame(t, box) {
        await timeout(contents.executeJavaScript(`window.__oms.seek(${Number(t)})`), `The frame at ${t.toFixed(2)} s`);
        await timeout(
          contents.executeJavaScript('Promise.all([...document.images].map(image => image.decode()).concat(document.fonts.ready)).then(() => true)'),
          'Loading image assets and faces',
        );
        const error = await failed();
        if (error) throw new Error(error);
        if (box) {
          await contents.executeJavaScript(`window.__omsMark?.(${JSON.stringify(box)})`);
          await contents.executeJavaScript('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))');
        }
        const image = await contents.capturePage();
        if (box) await contents.executeJavaScript('window.__omsMark?.(null)');
        const size = image.getSize();
        return size.width === film.width && size.height === film.height ? image : image.resize({ width: film.width, height: film.height });
      },
      close: () => window.destroy(),
    };
  } catch (error) {
    window.destroy();
    throw error;
  }
}

/** How many frames each scene is shown by on the timeline, evenly through it. */
export const SCENE_STILLS = 6;
/** The width the timeline's frames are kept at, in pixels; small, since they are drawn small. */
const STILL_WIDTH = 160;

/** Where a project keeps the timeline's frames: one file for the build they are of, named by that build's hash. */
export const stillsDir = (dir: string): string => join(dir, STATE_DIR, 'thumbs');

/**
 * Each scene of build `version` as SCENE_STILLS small frames, by scene id, as data URLs. They are kept in
 * `.motion-studio/thumbs/<hash of the build>.json`, so the same film is photographed once; making them for a new
 * build removes the files of the others there, and nothing outside that folder is written or removed.
 */
export async function sceneStills(dir: string, version: number, open: (version: number) => Promise<Stage>): Promise<SceneStills> {
  const hash = createHash('sha256')
    .update(await readFile(join(buildDir(dir), `film-${version}.js`)))
    .digest('hex')
    .slice(0, 16);
  const folder = stillsDir(dir);
  const file = join(folder, `${hash}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8')) as SceneStills;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const stage = await open(version);
  const stills: SceneStills = {};
  try {
    for (const scene of stage.film.scenes) {
      stills[scene.id] = [];
      for (let i = 0; i < SCENE_STILLS; i++) {
        const image = await stage.frame(scene.start + ((i + 0.5) / SCENE_STILLS) * scene.duration);
        stills[scene.id]!.push(`data:image/jpeg;base64,${image.resize({ width: STILL_WIDTH }).toJPEG(70).toString('base64')}`);
      }
    }
  } finally {
    stage.close();
  }
  await mkdir(folder, { recursive: true });
  // Written whole, then moved into place: a file there is always a whole one.
  await writeFile(`${file}.partial`, JSON.stringify(stills));
  await rename(`${file}.partial`, file);
  for (const name of await readdir(folder)) if (name !== `${hash}.json`) await rm(join(folder, name), { force: true });
  return stills;
}

/** Writes one chunk to a stream, waiting when its buffer is full. */
const write = (stream: NodeJS.WritableStream, chunk: Buffer) =>
  new Promise<void>((done, fail) => {
    stream.write(chunk, (error) => (error ? fail(error) : done()));
  });

/**
 * Renders build `version` of the film in `dir` to `file` as an MP4, its sounds mixed in, reporting the share done (0
 * to 1). The video is written beside `file` and moved into place only when it is whole, so a failed or cancelled
 * export leaves whatever was at `file` untouched.
 */
export async function exportFrames(
  dir: string,
  version: number,
  file: string,
  onProgress: (done: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const stage = await openStage(version);
  const partial = `${file}.partial.mp4`;
  try {
    const { film } = stage;
    const frames = Math.round(film.seconds * film.fps);
    // The sounds come after the picture's input (0); a film with none is picture only.
    const mix = soundMix(await soundInputs(dir, ffmpegPath(), film.sounds), frames / film.fps, 1);
    const ffmpeg = spawn(
      ffmpegPath(),
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        String(film.fps),
        '-c:v',
        'png',
        '-i',
        '-',
        ...(mix ? [...mix.inputs, '-filter_complex', mix.graph, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k'] : []),
        ...VIDEO,
        '-g',
        String(film.fps * 2),
        '-r',
        String(film.fps),
        '-frames:v',
        String(frames),
        '-movflags',
        '+faststart',
        partial,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-4000);
    });
    ffmpeg.stdin.on('error', () => {});
    const finished = new Promise<void>((done, fail) => {
      ffmpeg.on('error', fail);
      ffmpeg.on('close', (code) =>
        code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' / ')}`)),
      );
    });
    finished.catch(() => {});
    try {
      for (let i = 0; i < frames; i++) {
        if (signal.aborted) throw new Error('The export was cancelled.');
        await write(ffmpeg.stdin, (await stage.frame(i / film.fps)).toPNG());
        onProgress((i + 1) / frames);
      }
      ffmpeg.stdin.end();
    } catch (error) {
      ffmpeg.kill('SIGKILL');
      await finished.catch(() => {});
      throw error;
    }
    await finished;
    await rename(partial, file);
  } finally {
    stage.close();
    await rm(partial, { force: true });
  }
}
