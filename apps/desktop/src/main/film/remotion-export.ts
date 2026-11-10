// A film as a Remotion project (docs/tech/architecture.md, "Export"): the project's own files as they are, and beside them a
// Remotion entry whose one composition draws the film inside @motionhub/remotion's <MotionProvider>. There each scene is a
// Remotion <Sequence> named by its id, so the scenes are on Remotion Studio's timeline, and filmMetadata gives the
// composition its length from them, so it follows them as the film changes. Nothing is installed or run: the person runs
// npm and Remotion themselves, under Remotion's licence.

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { STATE_DIR, ignore, requireEmpty } from '../project';

/** The versions an exported project starts from: Remotion 4, and the motionhub packages whose <Film> draws in its <Sequence>s. */
export const REMOTION_DEPENDENCIES: Record<string, string> = {
  '@motionhub/remotion': '0.3.0',
  '@motionhub/runtime': '0.6.0',
  '@remotion/cli': '4.0.542',
  react: '19.3.1',
  'react-dom': '19.3.1',
  remotion: '4.0.542',
};

/** What of a project is not copied: the Studio's state, installed packages and git's own. */
const LEFT_OUT = new Set([STATE_DIR, 'node_modules', '.git']);

/** A Remotion composition id from a project's name: letters, digits and dashes. */
export const compositionId = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'film';

const ROOT = (id: string) => `// The Remotion composition of the film in ../film.tsx, written by Open Motion Studio.
import {Composition} from 'remotion';
import {MotionProvider, filmMetadata} from '@motionhub/remotion';
import Main, {film} from '../film';

const Film = () => (
  <MotionProvider tokens={{}} root={false}>
    <Main />
  </MotionProvider>
);

export const Root = () => (
  <Composition
    id="${id}"
    component={Film}
    durationInFrames={1}
    fps={film.fps ?? 30}
    width={film.width ?? 1920}
    height={film.height ?? 1080}
    calculateMetadata={() => filmMetadata(Main, film)}
  />
);
`;

const INDEX = `import {registerRoot} from 'remotion';
import {Root} from './Root';

registerRoot(Root);
`;

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    skipLibCheck: true,
  },
};

const README = (name: string, id: string) => `# ${name}

A film made in Open Motion Studio, as a Remotion project. Its scenes are Remotion \`<Sequence>\`s, named by their ids.

\`\`\`bash
npm install
npx remotion studio
npx remotion render ${id} out/${id}.mp4
\`\`\`

The film is \`film.tsx\`, unchanged: a \`<Film>\` of \`<Scene>\`s from \`@motionhub/runtime\`. \`src/Root.tsx\` gives it to Remotion, and
takes its length from its scenes.

Remotion has its own licence: free for individuals and for companies of up to three people, a company licence beyond
(https://remotion.dev/license).
`;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`${basename(file)} is not JSON: ${(error as Error).message}`);
  }
}

/**
 * Writes the film in `dir` as a Remotion project into `out`, a folder that is empty or does not exist yet and is not inside the
 * project. A package.json the project has keeps its own dependencies, with Remotion's added; a tsconfig.json or README.md it has
 * is kept as it is. Returns the composition's id.
 */
export async function writeRemotionProject(dir: string, out: string, name: string): Promise<string> {
  const project = resolve(dir);
  const target = resolve(out);
  if (target === project || target.startsWith(project + sep)) throw new Error('Export the Remotion project to a folder outside the film’s own.');
  await requireEmpty(target);
  await mkdir(target, { recursive: true });
  await cp(project, target, {
    recursive: true,
    filter: (source) => {
      const top = relative(project, source).split(sep)[0];
      return !top || !LEFT_OUT.has(top);
    },
  });

  const id = compositionId(name);
  const manifest = (await readJson(join(target, 'package.json'))) ?? {};
  const dependencies = { ...(manifest.dependencies as Record<string, string> | undefined), ...REMOTION_DEPENDENCIES };
  await writeFile(
    join(target, 'package.json'),
    json({
      ...manifest,
      name: manifest.name ?? id.toLowerCase(),
      private: true,
      scripts: { ...(manifest.scripts as Record<string, string> | undefined), studio: 'remotion studio', render: `remotion render ${id}` },
      dependencies,
    }),
  );
  await mkdir(join(target, 'src'), { recursive: true });
  await writeFile(join(target, 'src', 'index.ts'), INDEX);
  await writeFile(join(target, 'src', 'Root.tsx'), ROOT(id));
  if (!(await readJson(join(target, 'tsconfig.json')))) await writeFile(join(target, 'tsconfig.json'), json(TSCONFIG));
  try {
    await writeFile(join(target, 'README.md'), README(name, id), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  await ignore(target, ['node_modules/', 'out/']);
  return id;
}
