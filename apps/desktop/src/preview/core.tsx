// The preview core: what a film's page loads before the film itself. It holds
// React and @motionhub/runtime, gives the film's bundle its `require` for them, and draws
// the film at the time it is told, scaled to its frame. It runs in a sandboxed frame on
// the oms-preview: scheme (src/main/film/preview.ts) and talks to the Studio only
// by postMessage, the preview bridge protocol (src/shared/preview.ts):
//
//   - In the Studio's preview it plays on its own clock and obeys play, pause and seek.
//   - With ?render=1 it holds still and exposes window.__oms.seek(t) for the exporter and
//     for stills, which resolves once the frame at t is painted.
//
// Built by scripts/build-preview.mjs into resources/preview/core.js.

import * as runtime from '@motionhub/runtime';
import { type FilmOutline, MotionRuntimeProvider } from '@motionhub/runtime';
import * as React from 'react';
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { FilmInfo, FromPreview, ToPreview } from '../shared/preview';
import { FilmAudio } from './sound';

declare global {
  interface Window {
    /** In a render (?render=1): the film's size and length, and seek(t), resolved once the frame at t is painted. */
    __oms?: FilmInfo & { seek(t: number): Promise<number> };
    /** In a render: the first error the page met, for the main process to report. */
    __omsError?: string;
    /** The film's size, for studio/pick.js. */
    __omsFrame?: FilmInfo;
    require?: (name: string) => unknown;
  }
}

const MODULES: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  '@motionhub/runtime': runtime,
};

window.require = (name: string) => {
  if (name in MODULES) return MODULES[name];
  throw new Error(`The film imports "${name}", which the preview does not provide and the bundle did not include.`);
};

const post = (message: FromPreview) => {
  if (message.type === 'oms:error') window.__omsError ??= message.message;
  parent.postMessage(message, '*');
};

function reportErrors(): void {
  addEventListener('error', (event) => post({ type: 'oms:error', message: String(event.error?.stack ?? event.message) }));
  addEventListener('unhandledrejection', (event) => post({ type: 'oms:error', message: String(event.reason?.stack ?? event.reason) }));
}

interface FilmModule {
  default: ComponentType;
  film?: Partial<FilmInfo>;
}

const positive = (value: unknown, name: string, fallback: number): number => {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  throw new Error(`film.${name} must be a positive number of ${name === 'fps' ? 'frames a second' : 'pixels'}.`);
};

/** The project's narration as voice/ keeps it: the film's voice and, by line id, its clip's key and what it holds. */
interface Spoken {
  voice: string;
  lines: Record<string, { key: string; text: string; voice: string; seconds: number; words: FilmInfo['speech'][string]['words'] }>;
}

/** The project's narration, read from voice/ through the scheme; null when it has none, or a clip will not read (said in the console). */
async function spoken(): Promise<Spoken | null> {
  const response = await fetch('project/voice/lines.json');
  if (!response.ok) return null;
  try {
    const narration = (await response.json()) as { voice: string; lines: Record<string, string> };
    const lines: Spoken['lines'] = {};
    for (const [id, key] of Object.entries(narration.lines)) {
      if (!/^[0-9a-f]{16}$/.test(key)) continue;
      const clip = await fetch(`project/voice/${key}.json`);
      if (clip.ok) lines[id] = { key, ...((await clip.json()) as Omit<Spoken['lines'][string], 'key'>) };
    }
    return { voice: narration.voice, lines };
  } catch (error) {
    console.warn('The narration in voice/ did not read:', error);
    return null;
  }
}

/**
 * What the film is: its size and rate from `export const film`, and its length and scenes from the <Film> it draws. Learning
 * them takes one render, off the page, at its start, and one more when it has a narration: a line's speech is used only while
 * the line still says its words, in the film's voice, and the runtime times the voiced lines by it.
 */
function info(module: FilmModule, narration: Spoken | null = null): FilmInfo {
  const film = module.film ?? {};
  if (typeof module.default !== 'function') throw new Error('film.tsx has no default export: export default the film component.');
  const frame = {
    width: positive(film.width, 'width', 1920),
    height: positive(film.height, 'height', 1080),
    fps: positive(film.fps, 'fps', 30),
  };
  const write = 'its default export returns a <Film> of <Scene id duration>s, whose durations are its length';
  if ('seconds' in film) throw new Error(`film.tsx gives film.seconds, which a film no longer has: ${write}. Take seconds out of film.`);
  const unvoiced = outlineOf(module.default, frame);
  if (!unvoiced) throw new Error(`film.tsx draws no <Film>: ${write}.`);
  const speech: FilmInfo['speech'] = {};
  const keys: Record<string, string> = {};
  if (narration && unvoiced.voice && narration.voice === unvoiced.voice) {
    for (const line of unvoiced.scenes.flatMap((scene) => scene.lines)) {
      const clip = narration.lines[line.id];
      if (!clip || clip.text !== line.text || clip.voice !== unvoiced.voice) continue;
      speech[line.id] = { seconds: clip.seconds, words: clip.words };
      keys[line.id] = clip.key;
    }
  }
  const outline = Object.keys(speech).length ? outlineOf(module.default, frame, speech)! : unvoiced;
  const sounds = [...outline.sounds, ...outline.scenes.flatMap((scene) => scene.sounds)];
  const spokenLines = outline.scenes
    .flatMap((scene) => scene.lines)
    .filter((line) => line.voiced && keys[line.id])
    .map((line) => ({ line: line.id, src: `voice/${keys[line.id]}.mp3`, at: line.start, until: line.end }));
  return {
    ...frame,
    seconds: outline.seconds,
    scenes: outline.scenes,
    layers: outline.layers,
    sounds,
    captions: outline.captions,
    voice: outline.voice,
    narration: spokenLines,
    speech,
  };
}

/** The structure the film's <Film> reports when it is drawn once, off the page, at its start; null when it draws none. */
function outlineOf(Film: ComponentType, frame: { width: number; height: number; fps: number }, voice: FilmInfo['speech'] = {}): FilmOutline | null {
  let outline: FilmOutline | null = null;
  let failure: unknown = null;
  const root = createRoot(document.createElement('div'), { onUncaughtError: (error) => (failure ??= error) });
  const value = { useTime: () => 0, useCompositionTime: () => 0, ...frame, Video: Footage, voice, onFilm: (o: FilmOutline) => (outline = o) };
  flushSync(() =>
    root.render(
      <MotionRuntimeProvider value={value}>
        <Film />
      </MotionRuntimeProvider>,
    ),
  );
  root.unmount();
  if (failure) throw failure;
  return outline;
}

/** A <Video> stand-in until the Studio plays footage. */
const Footage = ({ style }: { style?: React.CSSProperties }) => (
  <div style={{ width: '100%', height: '100%', background: '#2a2d33', ...style }} />
);

function Frame({ Film, film, t, scale }: { Film: ComponentType; film: FilmInfo; t: number; scale: number }) {
  const value = {
    useTime: () => t,
    useCompositionTime: () => t,
    fps: film.fps,
    width: film.width,
    height: film.height,
    Video: Footage,
    voice: film.speech,
  };
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: film.width,
        height: film.height,
        overflow: 'hidden',
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      <MotionRuntimeProvider value={value}>
        <Film />
      </MotionRuntimeProvider>
    </div>
  );
}

function Player({ Film, film }: { Film: ComponentType; film: FilmInfo }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const range = useRef<{ start: number; end: number } | null>(null);
  const tRef = useRef(0);
  tRef.current = t;
  // The film's sounds; while they play, the audio clock is the preview's. A seek while playing starts them again there.
  const audio = useMemo(() => new FilmAudio(film.sounds, film.narration), [film]);
  const [from, setFrom] = useState(0);

  useEffect(() => {
    const fit = () => setScale(Math.min(innerWidth / film.width, innerHeight / film.height));
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [film]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ToPreview>) => {
      if (event.source !== parent) return;
      const message = event.data;
      if (message?.type === 'oms:play') {
        range.current = null;
        setPlaying(true);
      } else if (message?.type === 'oms:pause') setPlaying(false);
      else if (message?.type === 'oms:mute') audio.mute(message.muted === true);
      else if (message?.type === 'oms:seek') {
        range.current = null;
        tRef.current = Math.max(0, Math.min(film.seconds, message.t));
        setT(tRef.current);
        setFrom((n) => n + 1);
      } else if (
        message?.type === 'oms:play-range' &&
        Number.isFinite(message.start) &&
        Number.isFinite(message.end) &&
        message.end > message.start
      ) {
        const start = Math.max(0, Math.min(film.seconds, message.start));
        range.current = { start, end: Math.min(film.seconds, message.end) };
        tRef.current = start;
        setT(start);
        setPlaying(true);
        setFrom((n) => n + 1);
      }
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [film, audio]);

  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    void audio.play(tRef.current);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // With sounds, the picture keeps to the audio clock (held still until they start); without, to the page's.
      const next = audio.silent ? tRef.current + dt : (audio.now() ?? tRef.current);
      const end = range.current?.end ?? film.seconds;
      if (next >= end) {
        setT(end);
        range.current = null;
        setPlaying(false);
        return;
      }
      setT(next);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      audio.stop();
    };
  }, [playing, film, audio, from]);

  useEffect(() => post({ type: 'oms:time', t, playing }), [t, playing]);

  return <Frame Film={Film} film={film} t={t} scale={scale} />;
}

function Still({ Film, film }: { Film: ComponentType; film: FilmInfo }) {
  const [at, setAt] = useState({ t: 0, n: 0 });
  const painted = useRef<((t: number) => void) | null>(null);
  useEffect(() => {
    window.__oms = {
      ...film,
      seek: (t) =>
        new Promise((done) => {
          painted.current = done;
          setAt((a) => ({ t, n: a.n + 1 }));
        }),
    };
  }, [film]);
  useEffect(() => {
    const done = painted.current;
    if (!done) return;
    painted.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => done(at.t)));
  }, [at]);
  return <Frame Film={Film} film={film} t={at.t} scale={1} />;
}

function load(src: string): Promise<void> {
  return new Promise((done, fail) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => done();
    script.onerror = () => fail(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * The faces of the project's motions (build/fonts.css), loaded before the film draws, so its first frame is in them.
 * A face that will not load leaves its text in the next face of its stack, and is said in the console.
 */
async function faces(): Promise<void> {
  await new Promise<void>((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'build/fonts.css';
    link.onload = () => done();
    // A build from before faces were kept has none.
    link.onerror = () => done();
    document.head.appendChild(link);
  });
  const loaded = await Promise.allSettled([...document.fonts].map((face) => face.load()));
  for (const [i, result] of loaded.entries())
    if (result.status === 'rejected') console.warn(`The face ${[...document.fonts][i]?.family} did not load:`, result.reason);
}

async function start(): Promise<void> {
  reportErrors();
  const render = new URLSearchParams(location.search).get('render') === '1';
  const version = new URLSearchParams(location.search).get('v') ?? '';
  try {
    await faces();
    await load(`build/film-${Number(version)}.js`);
    const module = (globalThis as { __omsFilm?: FilmModule }).__omsFilm;
    if (!module) throw new Error('The film did not load.');
    const film = info(module, await spoken());
    const root = createRoot(document.getElementById('root')!);
    root.render(render ? <Still Film={module.default} film={film} /> : <Player Film={module.default} film={film} />);
    window.__omsFrame = film;
    post({ type: 'oms:ready', film });
  } catch (error) {
    post({ type: 'oms:error', message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

void start();
