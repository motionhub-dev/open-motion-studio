// Pointing at the picture, for every engine: loaded on every preview page after the engine's
// own bridge, which sets window.__omsFrame. Every page shows its frame whole and centred in the
// window (scaled down in the Studio's preview, at its own size in a render), so a point given
// as fractions of the frame is found on the page the same way whatever drew it.
//
//   oms:pick {x, y}  -> oms:picked {element, box}: the visible element drawn there, described
//   window.__omsMark(box | null)  outlines a box (fractions of the frame) for a still of a mark

import type { FilmInfo, FromPreview, PickedElement, ToPreview } from '../shared/preview';

declare global {
  interface Window {
    __omsFrame?: FilmInfo;
    __omsMark?: (box: Box | null) => void;
  }
}

type Box = { x: number; y: number; w: number; h: number };

/** Where the frame is drawn in the window: the film's size, contained and centred. */
function frameRect(): DOMRect {
  const film = window.__omsFrame ?? { width: innerWidth, height: innerHeight };
  const scale = Math.min(innerWidth / film.width, innerHeight / film.height);
  const width = film.width * scale;
  const height = film.height * scale;
  return new DOMRect((innerWidth - width) / 2, (innerHeight - height) / 2, width, height);
}

function visible(element: Element): boolean {
  for (let e: Element | null = element; e && e !== document.documentElement; e = e.parentElement) {
    const style = getComputedStyle(e);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
  }
  const r = element.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function name(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList].slice(0, 2).map((c) => `.${c}`).join('');
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function describe(element: Element, frame: DOMRect): PickedElement & { box: Box } {
  const path: string[] = [];
  for (let e: Element | null = element; e && e !== document.body && path.length < 5; e = e.parentElement) path.unshift(name(e));
  const attributes = Object.fromEntries(
    [...element.attributes]
      .filter((a) => a.name.startsWith('data-') || ['src', 'href', 'alt', 'aria-label'].includes(a.name))
      .slice(0, 8)
      .map((a) => [a.name, a.value.slice(0, 120)]),
  );
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const r = element.getBoundingClientRect();
  const box = {
    x: (r.left - frame.left) / frame.width,
    y: (r.top - frame.top) / frame.height,
    w: r.width / frame.width,
    h: r.height / frame.height,
  };
  return { path: path.join(' > '), text, attributes, box };
}

addEventListener('message', (event: MessageEvent<ToPreview>) => {
  if (event.source !== parent || event.data?.type !== 'oms:pick') return;
  const frame = frameRect();
  const x = frame.left + event.data.x * frame.width;
  const y = frame.top + event.data.y * frame.height;
  const element = document
    .elementsFromPoint(x, y)
    .find((e) => e !== document.body && e !== document.documentElement && !e.hasAttribute('data-oms-mark') && visible(e));
  let message: FromPreview;
  if (element) {
    const { box, ...picked } = describe(element, frame);
    message = { type: 'oms:picked', element: picked, box };
  } else {
    message = { type: 'oms:picked', element: null, box: null };
  }
  parent.postMessage(message, '*');
});

let outline: HTMLDivElement | null = null;
window.__omsMark = (box) => {
  outline?.remove();
  outline = null;
  if (!box) return;
  const frame = frameRect();
  outline = document.createElement('div');
  outline.setAttribute('data-oms-mark', '');
  Object.assign(outline.style, {
    position: 'fixed',
    left: `${frame.left + box.x * frame.width}px`,
    top: `${frame.top + box.y * frame.height}px`,
    width: `${box.w * frame.width}px`,
    height: `${box.h * frame.height}px`,
    border: `${Math.max(4, Math.round(frame.width / 320))}px solid #ff1744`,
    boxSizing: 'border-box',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(outline);
};
