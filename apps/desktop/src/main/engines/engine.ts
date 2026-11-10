// The engine contract (ADR 0001, docs/tech/architecture.md "The engine contract"): what
// the Studio needs of each engine a film can be written for. Everything else one engine
// needs stays in its own module. Stills need nothing here: every engine's preview page
// answers the preview bridge (src/shared/preview.ts), and capture.ts photographs it.

import type { BuildResult, EngineId } from '../../shared/api';
import { native } from './native';
import { remotion } from './remotion';

/** A film's preview bundle, kept up to date as its files change. */
export interface Bundler {
  /** Builds now; the result reaches the watcher's listener before this resolves. */
  rebuild(): Promise<unknown>;
  dispose(): Promise<void>;
}

export interface Engine {
  id: EngineId;
  /** Whether a folder holds a film written for this engine. */
  detect(dir: string): boolean;
  /** Makes an empty project a film for this engine, reporting each step. */
  create(dir: string, log: (line: string) => void): Promise<void>;
  /** Bundles the film's preview into the project's build folder, and again on every change. */
  watch(dir: string, onBuilt: (result: BuildResult) => void): Promise<Bundler>;
  /** The preview page's HTML, served at oms-preview://film/ (preview.ts). */
  page(version: number): string;
  /** Renders build `version` of the film to `file` as an MP4, reporting the share done (0 to 1). */
  exportFilm(dir: string, version: number, file: string, onProgress: (done: number) => void, signal: AbortSignal): Promise<void>;
  /** What the agent is told about making a film in this engine. */
  skill: string;
}

/** Every engine, in the order a folder is matched against them: a Remotion project may also hold a film.tsx. */
export const ENGINES: Engine[] = [remotion, native];

export const engineOf = (dir: string): Engine | null => ENGINES.find((engine) => engine.detect(dir)) ?? null;

export function engineById(id: unknown): Engine {
  const engine = ENGINES.find((e) => e.id === id);
  if (!engine) throw new Error(`No engine named ${String(id)}.`);
  return engine;
}
