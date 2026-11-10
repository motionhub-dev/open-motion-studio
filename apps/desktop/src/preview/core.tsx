// The preview core: what every native film's page loads before the film itself. It holds
// React and @motionhub/runtime, gives the film's bundle its `require` for them, and draws
// the film at the time it is told, scaled to its frame. It runs in a sandboxed frame on
// the oms-preview: scheme (src/main/engines/native/preview.ts) and talks to the Studio only
// by postMessage, the preview bridge protocol (src/shared/preview.ts):
//
//   - In the Studio's preview it plays on its own clock and obeys play, pause and seek.
//   - With ?render=1 it holds still and exposes window.__oms.seek(t) for the exporter and
//     for stills, which resolves once the frame at t is painted.
//
// Built by scripts/build-preview.mjs into resources/preview/core.js.

import * as runtime from '@motionhub/runtime';
import { MotionRuntimeProvider } from '@motionhub/runtime';
import * as React from 'react';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import type { FilmInfo, FromPreview, ToPreview } from '../shared/preview';

declare global {
  interface Window {
    /** In a render (?render=1): the film's size and length, and seek(t), resolved once the frame at t is painted. */
    __oms?: FilmInfo & { seek(t: number): Promise<number> };
    /** In a render: the first error the page met, for the main process to report. */
    __omsError?: string;
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

function info(module: FilmModule): FilmInfo {
  const film = module.film ?? {};
  if (typeof module.default !== 'function') throw new Error('film.tsx has no default export: export default the film component.');
  if (!(typeof film.seconds === 'number' && film.seconds > 0)) {
    throw new Error('film.tsx must export `film` with its length: export const film = {seconds: 10}.');
  }
  return { seconds: film.seconds, width: film.width ?? 1920, height: film.height ?? 1080, fps: film.fps ?? 30 };
}

/** A <Video> stand-in until the native engine plays footage. */
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
  const tRef = useRef(0);
  tRef.current = t;

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
      if (message?.type === 'oms:play') setPlaying(true);
      else if (message?.type === 'oms:pause') setPlaying(false);
      else if (message?.type === 'oms:seek') setT(Math.max(0, Math.min(film.seconds, message.t)));
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [film]);

  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = tRef.current + dt;
      if (next >= film.seconds) {
        setT(film.seconds);
        setPlaying(false);
        return;
      }
      setT(next);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, film]);

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

async function start(): Promise<void> {
  reportErrors();
  const render = new URLSearchParams(location.search).get('render') === '1';
  const version = new URLSearchParams(location.search).get('v') ?? '';
  try {
    await load(`build/film.js?v=${version}`);
    const module = (globalThis as { __omsFilm?: FilmModule }).__omsFilm;
    if (!module) throw new Error('The film did not load.');
    const film = info(module);
    const root = createRoot(document.getElementById('root')!);
    root.render(render ? <Still Film={module.default} film={film} /> : <Player Film={module.default} film={film} />);
    post({ type: 'oms:ready', film });
  } catch (error) {
    post({ type: 'oms:error', message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

void start();
