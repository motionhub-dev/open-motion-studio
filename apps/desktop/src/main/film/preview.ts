// The oms-preview: scheme, which serves the open film's preview page, the Studio's preview
// scripts, the film's bundle with its assets, and the project's own files. It is what a
// film's code runs under, so its policy lets the page load only from this scheme and reach
// nothing else (ADR 0004).
//
//   oms-preview://film/                  the page (?render=1 for stills and export, ?v= the build)
//   oms-preview://film/studio/<file>     the Studio's preview scripts (resources/preview/: core.js, pick.js)
//   oms-preview://film/build/<file>      the film's bundle and assets, and its motions' faces (fonts.css), from <project>/.motion-studio/build/
//   oms-preview://film/project/<file>    the project's own files (a motion's poster, previews and faces)

import { app, protocol, type Session, type WebContents } from 'electron';
import { readFile, realpath } from 'node:fs/promises';
import { extname, join, normalize, relative, sep } from 'node:path';
import { catalogueResource } from '../motions';
import { STATE_DIR } from '../project';
import { buildDir } from './film';

export const SCHEME = 'oms-preview';
export const PREVIEW_URL = `${SCHEME}://film/`;

const FILM_ORIGIN = `${SCHEME}://film`;

// Only the film's own host: the catalogue host on the same scheme is fetched from the network by the main
// process, so a film that could reach it could send what it reads from the project out in a URL (ADR 0004).
const POLICY = [
  "default-src 'none'",
  // Scripts come only from the film's host: the page carries none inline (the Studio's own
  // calls into a render page go through executeJavaScript, which the policy does not see).
  `script-src ${FILM_ORIGIN}`,
  `style-src ${FILM_ORIGIN} 'unsafe-inline'`,
  `img-src ${FILM_ORIGIN} data: blob:`,
  `font-src ${FILM_ORIGIN} data:`,
  `media-src ${FILM_ORIGIN} data: blob:`,
  // A film may fetch its own files; nothing beyond its host.
  `connect-src ${FILM_ORIGIN}`,
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const onFilm = (url: string | undefined) => {
  try {
    if (url === undefined) return false;
    // by protocol and host: URL gives a scheme it does not know the origin 'null'
    const { protocol, host } = new URL(url);
    return protocol === `${SCHEME}:` && host === 'film';
  } catch {
    return false;
  }
};

/** Whether a frame on `from`, or started by a frame on `by`, may go to `to`: a film never leaves its own host. */
export function filmMayNavigate(to: string, from?: string, by?: string): boolean {
  return onFilm(to) || (!onFilm(from) && !onFilm(by));
}

/** Holds every film frame in `contents` to its own host, which the policy alone cannot: it does not cover navigation. */
export function keepFilmsInPlace(contents: WebContents): void {
  contents.on('will-frame-navigate', (event) => {
    if (!filmMayNavigate(event.url, event.frame?.url, event.initiator?.url)) event.preventDefault();
  });
}

/** The preview page: the core holds React and the runtime and loads the film's bundle itself; pick.js answers pointing. */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}</style>
</head><body><div id="root"></div><script src="studio/core.js"></script><script src="studio/pick.js"></script></body></html>`;

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
  // CORS-enabled: a font or a fetched file is a CORS request, and a sandboxed frame's origin is null.
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } },
  ]);
}

/** Where the Studio's preview scripts are built to (scripts/build-preview.mjs). */
export const studioScripts = (): string => join(app.getAppPath(), 'resources', 'preview');

/** A path under `root` for a URL path, or null when it would leave it. */
export function within(root: string, urlPath: string): string | null {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  if (relative === '' || relative.split(/[/\\]/).includes('..')) return null;
  const path = join(root, relative);
  return path.startsWith(root + sep) ? path : null;
}

/** A preview can never read project state, Git metadata, or a symlink outside its root. */
export async function safePreviewFile(root: string, urlPath: string, project = false): Promise<string | null> {
  const file = within(root, urlPath);
  if (!file) return null;
  const actualRoot = await realpath(root);
  const actual = await realpath(file);
  const path = relative(actualRoot, actual);
  if (path === '..' || path.startsWith(`..${sep}`) || !actual.startsWith(actualRoot + sep)) return null;
  // lower-cased: macOS and Windows file systems ignore case, so .GIT is .git there
  const hidden = (value: string) =>
    value
      .toLowerCase()
      .split(/[/\\]/)
      .some((part) => part === '.motion-studio' || part === '.git' || part === 'node_modules');
  if (project && (hidden(path) || hidden(decodeURIComponent(urlPath)))) return null;
  return actual;
}

const CATALOGUE_POLICY = `default-src 'none'; script-src ${SCHEME}://catalogue; style-src ${SCHEME}://catalogue 'unsafe-inline'; img-src ${SCHEME}://catalogue data: blob:; font-src ${SCHEME}://catalogue data:; media-src ${SCHEME}://catalogue; connect-src ${SCHEME}://catalogue`;

function respond(body: string | Buffer, type: string, policy = POLICY): Response {
  return new Response(body, {
    headers: {
      'content-type': type,
      'content-security-policy': policy,
      'cache-control': 'no-store',
      // The only page that can ask is the film's own, from this scheme: the scheme serves nothing private to it.
      'access-control-allow-origin': '*',
    },
  });
}

/** Serves the film in the folder `film()` names (none while no film is open) on `session`'s oms-preview: scheme. */
export function servePreview(session: Session, film: () => string | null): void {
  session.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const dir = film();
    if (!dir) return new Response('Not found', { status: 404 });
    if (url.host === 'catalogue') {
      try {
        const resource = await catalogueResource(dir, url.pathname);
        return respond(resource.body, resource.type, CATALOGUE_POLICY);
      } catch {
        return new Response('The catalogue player could not be loaded.', { status: 502 });
      }
    }
    if (url.host !== 'film') return new Response('Not found', { status: 404 });
    try {
      if (url.pathname === '/' || url.pathname === '/index.html') return respond(PAGE, 'text/html');
      const roots = [
        ['/studio/', studioScripts()],
        ['/build/', buildDir(dir)],
        ['/reels/', join(dir, STATE_DIR, 'reels')],
        ['/project/', dir],
      ] as const;
      for (const [prefix, root] of roots) {
        if (!url.pathname.startsWith(prefix)) continue;
        const file = await safePreviewFile(root, url.pathname.slice(prefix.length), prefix === '/project/');
        if (file) return respond(await readFile(file), TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return new Response('Not found', { status: 404 });
  });
}
