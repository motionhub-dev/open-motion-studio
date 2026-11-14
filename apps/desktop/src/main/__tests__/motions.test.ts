import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueResource, motionDetail, motionFaces, motionReel, projectMotions, searchMotions, useMotion } from '../motions';

const ID = '@someone/paper-cut';
let root: string;
let project: string;
let server: Server;
let base: string;

/** A gzipped ustar archive of `files`, as motionhub.dev packs a motion (paths under its id). Built here, not with tar,
 * because the BSD tar of macOS and Windows reads an argument starting with @ as another archive. */
function tgz(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [path, text] of Object.entries(files)) {
    const body = Buffer.from(text);
    const header = Buffer.alloc(512);
    const put = (value: string, at: number, width: number) => header.write(value.slice(0, width), at, 'utf8');
    const octal = (value: number, width: number) => value.toString(8).padStart(width - 1, '0') + '\0';
    put(path, 0, 100);
    put(octal(0o644, 8), 100, 8);
    put(octal(0, 8), 108, 8);
    put(octal(0, 8), 116, 8);
    put(octal(body.length, 12), 124, 12);
    put(octal(0, 12), 136, 12);
    put('        ', 148, 8);
    put('0', 156, 1);
    put('ustar\0' + '00', 257, 8);
    const sum = header.reduce((total, byte) => total + byte, 0);
    put(octal(sum, 7) + ' ', 148, 8);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

/** A catalogue of one motion, packed as motionhub.dev packs it: a ustar archive with paths under the motion's id. */
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'oms-hub-'));
  const tgzFile = tgz({
    [`${ID}/motion.json`]: JSON.stringify({ slug: 'paper-cut', name: { en: 'Paper Cut' }, line: { en: 'Layers of cut paper.' } }),
    [`${ID}/MOTION.md`]: '# Paper Cut\n',
    [`${ID}/react/parts/title.tsx`]: 'export const Title = () => null;\n',
  });
  const index = {
    spec: 'motion/0.1',
    motions: [
      {
        slug: ID,
        version: '1.2.0',
        name: { en: 'Paper Cut' },
        line: { en: 'Layers of cut paper.' },
        tags: ['paper', 'light'],
        poster: `/m/${ID}/poster.jpg`,
        reel: `/m/${ID}/reel.mp4`,
        package: { url: `/m/${ID}/1.2.0.tgz`, sha256: createHash('sha256').update(tgzFile).digest('hex'), bytes: tgzFile.length },
      },
    ],
  };
  server = createServer((request, response) => {
    if (request.url === '/api/motions.json') response.end(JSON.stringify(index));
    else if (request.url === `/m/${ID}/reel.mp4`)
      response.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.from('0000ftypisom0000'));
    else if (request.url === '/play/demo/' || request.url === '/play/fallback.js')
      response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Demo reel</title>');
    else if (request.url === `/m/${ID}/1.2.0.tgz`) response.end(tgzFile);
    else response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  project = await mkdtemp(join(root, 'project-'));
});

describe('searchMotions', () => {
  it('finds motions by their words, with absolute addresses', async () => {
    const [found] = await searchMotions('paper light', base);
    expect(found).toMatchObject({ id: ID, name: 'Paper Cut', version: '1.2.0', poster: `${base}/m/${ID}/poster.jpg` });
    expect(await searchMotions('ocean', base)).toEqual([]);
  });
});

describe('useMotion', () => {
  it('takes the motion into motions/<id>/ and records it in the lock, as the motionhub CLI does', async () => {
    const used = await useMotion(project, ID, base);
    expect(used).toMatchObject({ id: ID, name: 'Paper Cut', version: '1.2.0', fromHub: true });
    expect(await readFile(join(project, 'motions', '@someone', 'paper-cut', 'react', 'parts', 'title.tsx'), 'utf8')).toContain('Title');
    const lock = JSON.parse(await readFile(join(project, 'motions.lock.json'), 'utf8'));
    expect(lock.motions[ID].version).toBe('1.2.0');
    expect(await projectMotions(project)).toEqual([used]);
  });

  it('never replaces a copy the project already holds', async () => {
    await useMotion(project, ID, base);
    await expect(useMotion(project, ID, base)).rejects.toThrow('already holds');
  });

  it('refuses anything but a motion id', async () => {
    for (const id of ['paper-cut', '@a/../../etc', '@a/b/c', 42])
      await expect(useMotion(project, id, base)).rejects.toThrow('Not a motion id');
  });
});

describe('projectMotions', () => {
  it('lists the project’s own motions beside the hub’s', async () => {
    await mkdir(join(project, 'motions', 'house-look'), { recursive: true });
    await writeFile(join(project, 'motions', 'house-look', 'motion.json'), JSON.stringify({ name: { en: 'House look' } }));
    expect(await projectMotions(project)).toEqual([
      { id: 'house-look', path: join('motions', 'house-look'), name: 'House look', line: '', version: null, fromHub: false, poster: null },
    ]);
  });
});

describe('motionDetail', () => {
  it('reads a motion’s text, colours and components as its files say them', async () => {
    const folder = join(project, 'motions', 'paper');
    await mkdir(join(folder, 'react', 'parts'), { recursive: true });
    await mkdir(join(folder, 'react', 'previews'), { recursive: true });
    await writeFile(join(folder, 'motion.json'), JSON.stringify({ name: { en: 'Paper' } }));
    await writeFile(join(folder, 'MOTION.md'), '# Paper\n\n## Essence\nCut paper.');
    await writeFile(join(folder, 'poster.jpg'), '');
    await writeFile(
      join(folder, 'tokens.json'),
      JSON.stringify({ color: { $type: 'color', ground: { $value: { hex: '#F7EFDD' } }, ink: { $value: '#1B2A47' } } }),
    );
    await writeFile(
      join(folder, 'react', 'parts', 'gauge.tsx'),
      "export const meta = {\n  name: {en: 'Depth gauge', 'zh-CN': 'x'},\n  purpose: 'data',\n  line: 'A card with a depth on it.',\n};\nexport const Gauge = () => null;\n",
    );
    await writeFile(join(folder, 'react', 'parts', 'shared.ts'), 'export const C = 1;');
    await writeFile(join(folder, 'react', 'previews', 'gauge.jpg'), '');
    const detail = await motionDetail(project, 'paper');
    expect(detail.motion).toMatchObject({ name: 'Paper', poster: 'motions/paper/poster.jpg' });
    expect(detail.markdown).toContain('Cut paper.');
    expect(detail.colors).toEqual([
      { name: 'ground', value: '#F7EFDD' },
      { name: 'ink', value: '#1B2A47' },
    ]);
    expect(detail.components).toEqual([
      {
        file: 'gauge.tsx',
        name: 'Depth gauge',
        purpose: 'data',
        line: 'A card with a depth on it.',
        preview: 'motions/paper/react/previews/gauge.jpg',
      },
    ]);
  });

  it('answers only for a motion the project holds', async () => {
    await expect(motionDetail(project, '../../etc')).rejects.toThrow('holds no motion');
  });
});

it('caches a catalogue reel locally without exposing a remote media URL', async () => {
  const url = await motionReel(project, ID, base);
  expect(url).toMatch(/^oms-preview:\/\/film\/reels\/[a-f0-9]+\.mp4$/);
  expect(await motionReel(project, ID, base)).toBe(url);
  const file = join(project, '.motion-studio', 'reels', url!.split('/').pop()!);
  expect(await readFile(file, 'utf8')).toBe('0000ftypisom0000');
});

it('serves HTML player resources separately and rejects pages disguised as assets', async () => {
  expect((await catalogueResource(project, '/play/demo/', base)).type).toBe('text/html');
  await expect(catalogueResource(project, '/play/fallback.js', base)).rejects.toThrow('page instead');
  await expect(catalogueResource(project, '/project/film.tsx', base)).rejects.toThrow('Not a catalogue');
  await expect(catalogueResource(project, 'https://elsewhere.test/play/demo/', base)).rejects.toThrow('Not a catalogue');
});

it('never follows a cached player resource symlink to an outside file', async () => {
  const folder = join(project, '.motion-studio', 'reels');
  await mkdir(folder, { recursive: true });
  const outside = join(root, 'private.txt');
  await writeFile(outside, 'private');
  const filename = createHash('sha256').update(`${base}/play/demo/`).digest('hex') + '.resource';
  await symlink(outside, join(folder, filename));
  await expect(catalogueResource(project, '/play/demo/', base)).rejects.toThrow('symbolic link');
});

describe("the motions' faces", () => {
  let dir: string;
  const fonts = (id: string) => join(dir, 'motions', id, 'react', 'fonts');
  async function motion(id: string, list: unknown, files: string[]) {
    await mkdir(fonts(id), { recursive: true });
    await writeFile(join(fonts(id), 'fonts.json'), typeof list === 'string' ? list : JSON.stringify(list));
    for (const file of files) await writeFile(join(fonts(id), file), 'wOF2');
  }
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'oms-faces-'));
  });

  it('declares each face a motion carries, from the project on the preview scheme', async () => {
    await motion('@someone/paper-cut', [{ family: 'Paper Serif', file: 'serif.woff2', weight: 400, style: 'italic' }], ['serif.woff2']);
    await motion('own', [{ family: 'Mono "Plus"', file: 'mono.woff2', weight: '100 900' }], ['mono.woff2']);
    const { css, skipped } = await motionFaces(dir);
    expect(skipped).toEqual([]);
    expect(css.split('\n')).toEqual([
      '@font-face { font-family: "Paper Serif"; src: url("/project/motions/%40someone/paper-cut/react/fonts/serif.woff2") format("woff2"); font-weight: 400; font-style: italic; font-display: block; }',
      '@font-face { font-family: "Mono \\"Plus\\""; src: url("/project/motions/own/react/fonts/mono.woff2") format("woff2"); font-weight: 100 900; font-display: block; }',
    ]);
  });

  it('leaves out, and says, a face whose file is not a WOFF2 beside it', async () => {
    await motion(
      '@someone/paper-cut',
      [
        { family: 'Escapes', file: '../../../../secret.woff2' },
        { family: 'Missing', file: 'gone.woff2' },
        { family: 'Not a face', file: 'face.ttf' },
        { file: 'nameless.woff2' },
        { family: 'Kept', file: 'kept.woff2', weight: '400; color: red', style: 'bold' },
      ],
      ['face.ttf', 'nameless.woff2', 'kept.woff2'],
    );
    await motion('broken', '{not json', []);
    const { css, skipped } = await motionFaces(dir);
    expect(css).toBe('@font-face { font-family: "Kept"; src: url("/project/motions/%40someone/paper-cut/react/fonts/kept.woff2") format("woff2"); font-display: block; }');
    expect(skipped).toHaveLength(5);
    expect(skipped.join('\n')).toContain('broken: react/fonts/fonts.json is not JSON');
    expect(skipped.join('\n')).toContain('gone.woff2 is not there');
  });

  it('is empty for a project without motions or faces', async () => {
    expect(await motionFaces(dir)).toEqual({ css: '', skipped: [] });
    await mkdir(join(dir, 'motions', 'plain'), { recursive: true });
    expect(await motionFaces(dir)).toEqual({ css: '', skipped: [] });
  });
});
