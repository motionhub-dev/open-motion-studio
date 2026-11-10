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
}

export type ToPreview = { type: 'oms:play' } | { type: 'oms:pause' } | { type: 'oms:seek'; t: number };

export type FromPreview =
  | { type: 'oms:ready'; film: FilmInfo }
  | { type: 'oms:time'; t: number; playing: boolean }
  | { type: 'oms:error'; message: string };
