// Types for the parts of @motionhub/cli's library (tools/hub.mjs) the Studio uses. The
// package ships JavaScript only.

declare module '@motionhub/cli/hub' {
  export const HUB: string;
  export const MOTIONS: string;
  export const LOCK: string;

  type Localized = Record<string, string>;

  /** One row of motionhub.dev's index (/api/motions.json), its paths relative to the site. */
  export interface HubMotion {
    slug: string;
    scope?: string;
    version: string;
    name: Localized;
    line: Localized;
    lang?: string;
    tags: string[];
    catalogs?: string[];
    fit?: { for?: Localized; not?: Localized };
    license?: { text?: string; code?: string };
    poster?: string;
    reel?: string;
    package: { url: string; sha256: string; bytes: number };
  }

  export interface Lock {
    lockfileVersion: number;
    motions: Record<string, { version: string; sha256: string }>;
  }

  export function index(base?: string): Promise<HubMotion[]>;
  export function search(rows: HubMotion[], words: string[]): HubMotion[];
  export function getMotion(id: string, out: string, base?: string, rows?: HubMotion[]): Promise<HubMotion>;
  export function motionPath(id: string, root?: string): string;
  export function readLock(root?: string): Lock;
  export function writeLock(lock: Lock, root?: string): void;
}
