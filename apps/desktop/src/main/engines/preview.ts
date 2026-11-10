// The oms-preview: scheme, which serves the open film's preview page: the page its engine
// writes, the native preview core, the film's bundle with its assets, and the project's
// public/ folder. It is what a film's code runs under, so its policy lets the page load only
// from this scheme and connect nowhere (ADR 0004).
//
//   oms-preview://film/                 the page (?render=1 for stills and export, ?v= the build)
//   oms-preview://film/core.js          the native preview core (resources/preview/core.js)
//   oms-preview://film/build/<file>     the film's bundle and assets, from <project>/.motion-studio/build/
//   oms-preview://film/public/<file>    the project's public/ folder (Remotion's staticFile())

import { app, protocol, type Session } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Engine } from './engine';
import { buildDir } from './native';

/** The film the scheme serves: the open project's folder and its engine. */
export interface PreviewSource {
  dir: string;
  engine: Engine;
}

export const SCHEME = 'oms-preview';
export const PREVIEW_URL = `${SCHEME}://film/`;

const POLICY = [
  "default-src 'none'",
  `script-src ${SCHEME}:`,
  `style-src ${SCHEME}: 'unsafe-inline'`,
  `img-src ${SCHEME}: data: blob:`,
  `font-src ${SCHEME}: data:`,
  `media-src ${SCHEME}: data: blob:`,
  "connect-src 'none'",
].join('; ');

const page = (body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>
</head><body>${body}</body></html>`;

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

/** Must run before the app is ready. */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);
}

export const coreFile = (): string => join(app.getAppPath(), 'resources', 'preview', 'core.js');

/** A path under `root` for a URL path, or null when it would leave it. */
export function within(root: string, urlPath: string): string | null {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  if (relative === '' || relative.split(/[/\\]/).includes('..')) return null;
  const path = join(root, relative);
  return path.startsWith(root + sep) ? path : null;
}

function respond(body: string | Buffer, type: string): Response {
  return new Response(body, {
    headers: { 'content-type': type, 'content-security-policy': POLICY, 'cache-control': 'no-store' },
  });
}

/** Serves the film `film()` names on `session`'s oms-preview: scheme. */
export function servePreview(session: Session, film: () => PreviewSource | null): void {
  session.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const source = film();
    if (url.host !== 'film' || !source) return new Response('Not found', { status: 404 });
    const version = Number(url.searchParams.get('v')) || 0;
    try {
      if (url.pathname === '/' || url.pathname === '/index.html') return respond(page(source.engine.page(version)), 'text/html');
      if (url.pathname === '/core.js') return respond(await readFile(coreFile()), TYPES['.js']!);
      for (const [prefix, root] of [['/build/', buildDir(source.dir)], ['/public/', join(source.dir, 'public')]] as const) {
        if (!url.pathname.startsWith(prefix)) continue;
        const file = within(root, url.pathname.slice(prefix.length));
        if (file) return respond(await readFile(file), TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return new Response('Not found', { status: 404 });
  });
}
