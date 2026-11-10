// The HyperFrames bridge: loaded after a HyperFrames project's own page, under the
// HyperFrames runtime from the project's node_modules (src/main/engines/hyperframes.ts). It
// answers the preview bridge protocol (src/shared/preview.ts) by driving the runtime's
// window.__player, scales the page to the frame in the Studio's preview, and with ?render=1
// exposes window.__oms.seek(t) for stills.

import type { FilmInfo, FromPreview, ToPreview } from '../shared/preview';

interface HyperFramesPlayer {
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
}

declare global {
  interface Window {
    __player?: HyperFramesPlayer;
    __playerReady?: boolean;
    __hfWaitForSeekCompletion?: () => Promise<unknown>;
    __oms?: FilmInfo & { seek(t: number): Promise<number> };
    __omsError?: string;
    __omsFrame?: FilmInfo;
  }
}

/** How long the runtime may take to start before the page is reported as broken. */
const START_MS = 20_000;

const post = (message: FromPreview) => {
  if (message.type === 'oms:error') window.__omsError ??= message.message;
  parent.postMessage(message, '*');
};

addEventListener('error', (e) => post({ type: 'oms:error', message: String(e.error?.stack ?? e.message) }));
addEventListener('unhandledrejection', (e) => post({ type: 'oms:error', message: String(e.reason?.stack ?? e.reason) }));

const frames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

async function started(): Promise<HyperFramesPlayer> {
  const until = Date.now() + START_MS;
  while (!(window.__playerReady && window.__player)) {
    if (Date.now() > until) {
      throw new Error('The HyperFrames runtime did not start. Is the project installed (npm install in its folder)?');
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  return window.__player;
}

function info(player: HyperFramesPlayer): FilmInfo {
  const root = document.querySelector<HTMLElement>('[data-composition-id]');
  const number = (value: string | undefined, fallback: number) => (Number(value) > 0 ? Number(value) : fallback);
  return {
    seconds: player.getDuration(),
    width: number(root?.dataset.width, 1920),
    height: number(root?.dataset.height, 1080),
    fps: 30,
  };
}

/** Shows the page's fixed-size frame whole, centred, in a preview of any size. */
function fit(film: FilmInfo): void {
  const body = document.body;
  document.documentElement.style.background = '#000';
  document.documentElement.style.overflow = 'hidden';
  const place = () => {
    const scale = Math.min(innerWidth / film.width, innerHeight / film.height);
    body.style.transformOrigin = '0 0';
    body.style.transform = `translate(${(innerWidth - film.width * scale) / 2}px, ${(innerHeight - film.height * scale) / 2}px) scale(${scale})`;
  };
  place();
  addEventListener('resize', place);
}

async function start(): Promise<void> {
  const player = await started();
  const film = info(player);
  const render = new URLSearchParams(location.search).get('render') === '1';
  if (render) {
    window.__oms = {
      ...film,
      seek: async (t) => {
        player.seek(t);
        await window.__hfWaitForSeekCompletion?.();
        await frames();
        return t;
      },
    };
  } else {
    fit(film);
    addEventListener('message', (event: MessageEvent<ToPreview>) => {
      if (event.source !== parent) return;
      const message = event.data;
      if (message?.type === 'oms:play') player.play();
      else if (message?.type === 'oms:pause') player.pause();
      else if (message?.type === 'oms:seek') player.seek(Math.max(0, Math.min(film.seconds, message.t)));
    });
    let last = { t: -1, playing: false };
    const report = () => {
      const now = { t: player.getTime(), playing: player.isPlaying() };
      if (now.t !== last.t || now.playing !== last.playing) post({ type: 'oms:time', ...now });
      last = now;
      requestAnimationFrame(report);
    };
    requestAnimationFrame(report);
  }
  window.__omsFrame = film;
  post({ type: 'oms:ready', film });
}

start().catch((error: unknown) => post({ type: 'oms:error', message: error instanceof Error ? error.message : String(error) }));
