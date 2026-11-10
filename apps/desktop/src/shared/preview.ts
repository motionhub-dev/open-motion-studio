// The preview bridge protocol: the messages between the Studio and a film's preview frame
// (docs/tech/architecture.md, "The film").

export interface FilmInfo {
  seconds: number;
  width: number;
  height: number;
  fps: number;
}

/** A box on the frame, in fractions of its width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The element drawn at a point the person picked, as the page describes it. */
export interface PickedElement {
  /** Its place among its ancestors: `div#root > h1#title.clip`. */
  path: string;
  /** Its words, shortened. */
  text: string;
  /** Its data-* attributes, src, href, alt and aria-label. */
  attributes: Record<string, string>;
  /** The computed styles that say how it looks: font, size, weight, colour, and background, opacity and transform where set. */
  styles: Record<string, string>;
}

export type ToPreview =
  | { type: 'oms:play' }
  | { type: 'oms:pause' }
  | { type: 'oms:seek'; t: number }
  /** The element drawn at a point, in fractions of the frame (studio/pick.js answers). */
  | { type: 'oms:pick'; x: number; y: number };

export type FromPreview =
  | { type: 'oms:ready'; film: FilmInfo }
  | { type: 'oms:time'; t: number; playing: boolean }
  | { type: 'oms:error'; message: string }
  | { type: 'oms:picked'; element: PickedElement | null; box: Box | null };
