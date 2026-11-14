import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REMOTION_DEPENDENCIES, compositionId, writeRemotionProject } from '../remotion-export';

vi.mock('electron', () => ({}));

let root: string;
let film: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'oms-remotion-'));
  film = join(root, 'heat pump');
  await mkdir(join(film, 'parts'), { recursive: true });
  await mkdir(join(film, 'motions', '@iamsuosi', 'plumb-line'), { recursive: true });
  await mkdir(join(film, '.motion-studio', 'build'), { recursive: true });
  await mkdir(join(film, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(film, 'film.tsx'), 'export const film = {fps: 25};\n');
  await writeFile(join(film, 'parts', 'title.tsx'), 'export const Title = () => null;\n');
  await writeFile(join(film, 'motions', '@iamsuosi', 'plumb-line', 'tokens.json'), '{}');
  await writeFile(join(film, '.motion-studio', 'session.json'), '[]');
  await writeFile(join(film, '.gitignore'), '.motion-studio/\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('writeRemotionProject', () => {
  it('copies the film as it is, leaves out the Studio’s state and installed packages, and adds a Remotion entry', async () => {
    const out = join(root, 'out');
    expect(await writeRemotionProject(film, out, 'heat pump', ['intro', 'how'])).toBe('heat-pump');
    expect((await readdir(out)).sort()).toEqual(['.gitignore', 'README.md', 'film.tsx', 'motions', 'package.json', 'parts', 'src', 'tsconfig.json']);
    expect(await readFile(join(out, 'film.tsx'), 'utf8')).toBe('export const film = {fps: 25};\n');
    expect(await readFile(join(out, 'motions', '@iamsuosi', 'plumb-line', 'tokens.json'), 'utf8')).toBe('{}');
    const root_ = await readFile(join(out, 'src', 'Root.tsx'), 'utf8');
    expect(root_).toContain('id="heat-pump"');
    expect(root_).toContain('calculateMetadata={() => filmMetadata(Main, film, SCENES)}');
    expect(root_).toContain('const SCENES = ["intro", "how"];');
    expect(root_.match(/<Series.Sequence name=\{"(\w+)"\} durationInFrames=\{frames\["\1"\]\}>\{scene\("\1"\)\}<\/Series.Sequence>\n/g)).toHaveLength(2);
    expect(root_).toContain("import Main, {film} from '../film';");
    expect(await readFile(join(out, 'src', 'index.ts'), 'utf8')).toContain('registerRoot(Root)');
    const manifest = JSON.parse(await readFile(join(out, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toEqual(REMOTION_DEPENDENCIES);
    expect(manifest.scripts.render).toBe('remotion render heat-pump');
    expect(await readFile(join(out, '.gitignore'), 'utf8')).toBe('.motion-studio/\nnode_modules/\nout/\n');
  });

  it('keeps a package.json’s own dependencies, and a README the film already has', async () => {
    await writeFile(join(film, 'package.json'), JSON.stringify({ name: 'mine', dependencies: { three: '0.180.0', react: '18.0.0' } }));
    await writeFile(join(film, 'README.md'), 'Mine.\n');
    const out = join(root, 'out');
    await writeRemotionProject(film, out, 'heat pump', ['intro', 'how']);
    const manifest = JSON.parse(await readFile(join(out, 'package.json'), 'utf8'));
    expect(manifest.name).toBe('mine');
    expect(manifest.dependencies).toEqual({ ...REMOTION_DEPENDENCIES, three: '0.180.0' });
    expect(await readFile(join(out, 'README.md'), 'utf8')).toBe('Mine.\n');
  });

  it('copies the film’s sounds into public/, for FilmAudio to play, and refuses one the project does not have', async () => {
    await mkdir(join(film, 'media'), { recursive: true });
    await writeFile(join(film, 'media', 'bed.mp3'), 'sound');
    const out = join(root, 'out');
    await writeRemotionProject(film, out, 'heat pump', ['intro'], ['media/bed.mp3', './media/bed.mp3', 'build/hit-AB12.wav']);
    expect(await readFile(join(out, 'public', 'media', 'bed.mp3'), 'utf8')).toBe('sound');
    // Its place in the film stays too, where film.tsx may import it.
    expect(await readFile(join(out, 'media', 'bed.mp3'), 'utf8')).toBe('sound');
    expect(await readFile(join(out, 'src', 'Root.tsx'), 'utf8')).toContain('<FilmAudio component={Main} film={film} />');
    await expect(writeRemotionProject(film, join(root, 'again'), 'f', ['intro'], ['media/missing.mp3'])).rejects.toThrow('is no file in the project');
  });

  it('refuses a folder that is not empty, or one inside the film', async () => {
    const full = join(root, 'full');
    await mkdir(full);
    await writeFile(join(full, 'x.txt'), 'x');
    await expect(writeRemotionProject(film, full, 'f', ['a'])).rejects.toThrow('not empty');
    await expect(writeRemotionProject(film, join(film, 'export'), 'f', ['a'])).rejects.toThrow('outside');
    await expect(writeRemotionProject(film, film, 'f', ['a'])).rejects.toThrow('outside');
    await expect(writeRemotionProject(film, join(root, 'empty'), 'f', [])).rejects.toThrow('no scenes');
  });

  it('names the composition in letters, digits and dashes', () => {
    expect(compositionId('Heat pump: how?')).toBe('Heat-pump-how');
    expect(compositionId('热泵')).toBe('film');
  });
});
