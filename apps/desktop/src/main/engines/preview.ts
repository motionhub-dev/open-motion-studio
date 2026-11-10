// The oms-preview: scheme, which serves a native film's preview page: the page itself, the
// preview core and the film's bundle with its assets. It is what a film's code runs under,
// so its policy lets the page load only from this scheme and connect nowhere
// (CLAUDE.md, "Architecture rules").
//
//   oms-preview://film/                 the page (?render=1 for stills and export, ?v= the build)
//   oms-preview://film/core.js          the preview core (resources/preview/core.js)
//   oms-preview://film/build/<file>     the film's bundle and assets, from <project>/.motion-studio/build/

import { app, protocol, type Session } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { buildDir } from './native';

export const SCHEME = 'oms-preview';
export const PREVIEW_URL = `${SCHEME}://film/`;

const POLICY = [
  "default-src 'none'",
  `script-src ${SCHEME}:`,
  `style-src ${SCHEME}: 'unsafe-inline'`,
  `img-src ${SCHEME}: data: blob:`,
  `font-src ${SCHEME}: data:`,
  `media-src ${SCHEME}: blob:`,
  "connect-src 'none'",
].join('; ');

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style>
</head><body><div id="root"></div><script src="core.js"></script></body></html>`;

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

/** Serves the film of the project `projectDir()` names on `session`'s oms-preview: scheme. */
export function servePreview(session: Session, projectDir: () => string | null): void {
  session.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const dir = projectDir();
    if (url.host !== 'film' || !dir) return new Response('Not found', { status: 404 });
    try {
      if (url.pathname === '/' || url.pathname === '/index.html') return respond(PAGE, 'text/html');
      if (url.pathname === '/core.js') return respond(await readFile(coreFile()), TYPES['.js']!);
      if (url.pathname.startsWith('/build/')) {
        const file = within(buildDir(dir), url.pathname.slice('/build/'.length));
        if (file) return respond(await readFile(file), TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return new Response('Not found', { status: 404 });
  });
}
