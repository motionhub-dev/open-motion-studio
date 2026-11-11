// Bundled films are ordinary projects: opened locally, editable, and never reset on reopen.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Example, Project } from '../shared/api';
import { createProject, projectAt } from './project';

export const EXAMPLES: Example[] = [
  { id: 'kinetic', name: 'Kinetic type', line: 'A few words. A little momentum.', title: 'MAKE IT MOVE', seconds: 7 },
  { id: 'product', name: 'A product moment', line: 'Give your next launch room to breathe.', title: 'MEET SOMETHING NEW', seconds: 7 },
  { id: 'data', name: 'A story in numbers', line: 'Turn a change into a clear visual.', title: 'SMALL STEPS. BIG CHANGE.', seconds: 7 },
];
export function exampleSource(example: Example): string {
  return `import { Film, Scene, Layer, Line, useTime, interpolate } from '@motionhub/runtime';
export const film = { width: 1920, height: 1080, fps: 30 };
function Picture({ closing = false }: { closing?: boolean }) {
  const t = useTime();
  const enter = interpolate(t, [0, .8], [0, 1], { clamp: true });
  const count = Math.round(interpolate(t, [0, 3], [0, 84], { clamp: true }));
  return <div style={{ width: '100%', height: '100%', padding: 130, boxSizing: 'border-box', background: '#f3eee4', color: '#2a2622', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
    <p style={{ fontSize: 24, letterSpacing: 7, margin: '0 0 50px' }}>{closing ? 'YOUR NEXT IDEA STARTS HERE' : 'OPEN MOTION STUDIO / ${example.id.toUpperCase()}'}</p>
    ${example.id === 'data' ? "{!closing && <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', height: 250, marginBottom: 50 }}>{[.3, .5, .7, 1].map((height, i) => <div key={i} style={{ width: 170, height: 250 * height * enter + 1, background: '#2a2622', opacity: .25 + i * .25 }} />)}<strong style={{ fontSize: 150, lineHeight: 1 }}>{count}%</strong></div>}" : ''}
    <h1 style={{ fontSize: ${example.id === 'product' ? 150 : 170}, lineHeight: 1.02, letterSpacing: -9, maxWidth: 1500, margin: 0, transform: 'translateY(' + (1-enter)*60 + 'px)', opacity: .2 + enter * .8 }}>{closing ? 'Make it yours.' : ${JSON.stringify(example.title)}}</h1>
    <p style={{ fontSize: 34, lineHeight: 1.5, margin: '50px 0 0', opacity: .65 }}>{closing ? 'Point at a detail. Ask for a change. Keep exploring.' : ${JSON.stringify(example.line)}}</p>
  </div>;
}
export default function Main() {
  return <Film><Scene id="idea" duration={4}><Line id="idea-line">${example.title}</Line><Layer id="artwork"><Picture /></Layer></Scene><Scene id="make-it-yours" duration={3}><Line id="closing-line">Make it yours.</Line><Layer id="closing"><Picture closing /></Layer></Scene></Film>;
}
`;
}
export async function openExample(root: string, id: unknown): Promise<Project> {
  const example = EXAMPLES.find((e) => e.id === id);
  if (!example) throw new Error('Choose one of the starting points.');
  const dir = join(root, 'Examples', example.name);
  if (!existsSync(join(dir, 'film.tsx'))) {
    await mkdir(join(root, 'Examples'), { recursive: true });
    await createProject(dir);
    await writeFile(join(dir, 'film.tsx'), exampleSource(example), { flag: 'wx' });
  }
  return projectAt(dir);
}
