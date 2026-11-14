// The preview bridge protocol: the messages between the Studio and a film's preview frame
// (docs/tech/architecture.md, "The film").

import type { FilmLine } from '@motionhub/runtime';
import type { FilmSound } from './sound';

export interface FilmInfo {
  seconds: number;
  width: number;
  height: number;
  fps: number;
  /** Its scenes in order: its <Film>'s, end to end. */
  scenes: SceneInfo[];
  /** The film's own layers, drawn across every scene. */
  layers: LayerBox[];
  /** Every <Sound> it plays, the film's own and its scenes', in the film's seconds (shared/sound.ts). */
  sounds: FilmSound[];
  /** Whether it draws its lines as captions (<Film captions>). */
  captions: boolean;
}

/** A box of the frame a <Layer> draws in, in the film's pixels. */
export interface LayerBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/** One <Scene> of a film: its span, its layers and what it says. */
export interface SceneInfo {
  id: string;
  /** Seconds into the film. */
  start: number;
  duration: number;
  layers: LayerBox[];
  /** What it says, each line with when it is said, in the film's seconds. */
  lines: FilmLine[];
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
  /** The <Scene> and the <Layer> it is drawn in, for a film of scenes. */
  scene?: string;
  layer?: string;
}

export type ToPreview =
  | { type: 'oms:play' }
  | { type: 'oms:pause' }
  | { type: 'oms:play-range'; start: number; end: number }
  | { type: 'oms:seek'; t: number }
  /** Whether the preview's sound is off. */
  | { type: 'oms:mute'; muted: boolean }
  /** The element drawn at a point, in fractions of the frame, or the one `depth` elements around it (studio/pick.js answers). */
  | { type: 'oms:pick'; x: number; y: number; depth?: number }
  /** Draws one layer alone, every other <Layer> hidden; null draws them all again (studio/pick.js). */
  | { type: 'oms:solo'; layer: string | null };

export type FromPreview =
  | { type: 'oms:ready'; film: FilmInfo }
  | { type: 'oms:time'; t: number; playing: boolean }
  | { type: 'oms:error'; message: string }
  /** `levels` is how many elements, the innermost first, a pick at that point can step out through. */
  | { type: 'oms:picked'; element: PickedElement | null; box: Box | null; levels: number };
