import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { projectMotions, searchMotions, useMotion } from '../motions';

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
        package: { url: `/m/${ID}/1.2.0.tgz`, sha256: createHash('sha256').update(tgzFile).digest('hex'), bytes: tgzFile.length },
      },
    ],
  };
  server = createServer((request, response) => {
    if (request.url === '/api/motions.json') response.end(JSON.stringify(index));
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
    for (const id of ['paper-cut', '@a/../../etc', '@a/b/c', 42]) await expect(useMotion(project, id, base)).rejects.toThrow('Not a motion id');
  });
});

describe('projectMotions', () => {
  it('lists the project’s own motions beside the hub’s', async () => {
    await mkdir(join(project, 'motions', 'house-look'), { recursive: true });
    await writeFile(join(project, 'motions', 'house-look', 'motion.json'), JSON.stringify({ name: { en: 'House look' } }));
    expect(await projectMotions(project)).toEqual([
      { id: 'house-look', path: join('motions', 'house-look'), name: 'House look', line: '', version: null, fromHub: false },
    ]);
  });
});
