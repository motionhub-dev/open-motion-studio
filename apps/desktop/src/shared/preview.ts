// The preview bridge protocol: the messages between the Studio and a film's preview frame.
// Every engine's preview answers the same messages (docs/tech/architecture.md, "The engine
// contract").

export interface FilmInfo {
  seconds: number;
  width: number;
  height: number;
  fps: number;
  /** The Remotion composition the page shows; none for a native film. */
  composition?: string;
  /** The film's timed pieces, where its engine knows them (HyperFrames); none otherwise. */
  clips?: Clip[];
}

/** One timed piece of a film, as its engine reports it, for the read-only timeline. */
export interface Clip {
  id: string;
  label: string;
  /** Seconds into the film. */
  start: number;
  duration: number;
  /** The lane it is drawn in. */
  track: number;
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
