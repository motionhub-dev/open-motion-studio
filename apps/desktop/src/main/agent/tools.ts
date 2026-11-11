// The agent's tools: what it may do to the open project. Each runs in the main process,
// inside the project's folder only. It may read any file there, and write any but the
// Studio's own state, the motions taken from motionhub (which a project never changes),
// dependencies and git's.

import type Anthropic from '@anthropic-ai/sdk';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { BuildResult } from '../../shared/api';
import type { SceneInfo } from '../../shared/preview';
import type { Stage } from '../film/capture';
import { STATE_DIR } from '../project';

type Tool = Anthropic.Beta.BetaTool;
type Block = Anthropic.Beta.BetaToolResultBlockParam['content'];

/** What the tools reach in the app: the project, its build, and the catalogue. */
export interface ToolContext {
  dir: string;
  write?(path: string, content: string, expected?: string): Promise<void>;
  /** Builds the film now and returns the result. */
  build(): Promise<BuildResult>;
  /** Opens build `version` of the film for photographing. */
  stage(version: number): Promise<Stage>;
  searchMotions(words: string): Promise<{ id: string; name: string; line: string; fit: string }[]>;
  useMotion(id: string): Promise<{ id: string; path: string }>;
}

export interface ToolOutcome {
  ok: boolean;
  /** What the model reads. */
  content: Block;
  /** What the person sees. */
  text: string;
  /** A picture the person sees beside it, as a data URL. */
  image?: string;
}

const MAX_READ = 200_000;
const MAX_LIST = 500;
const SKIP = new Set(['node_modules', '.git', STATE_DIR]);

export const TOOLS: Tool[] = [
  {
    name: 'list_files',
    description:
      "Lists the files under a folder of the project (the whole project by default), skipping node_modules, .git and the Studio's own state.",
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'A folder, relative to the project.' } } },
  },
  {
    name: 'read_file',
    description: 'Reads a text file of the project.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description:
      'Writes a whole text file of the project, creating its folders. Prefer edit_file for a small change to a file that exists.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string', description: 'The whole file.' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replaces one exact passage of a file with another. old_text must occur exactly once in the file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'check',
    description:
      "Builds the film and plays it at its start, the middle of each scene and its end. Reports build errors and errors thrown while drawing, or, when it is sound, its length and size and each scene: its span, its layers' boxes and its lines.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'still',
    description: 'Shows the frame of the film at a time, as a picture, so you can see what you drew.',
    input_schema: {
      type: 'object',
      properties: { time: { type: 'number', description: "Seconds from the film's start." } },
      required: ['time'],
    },
  },
  {
    name: 'search_motions',
    description:
      "Searches motionhub.dev's catalogue of motions (looks) by words in their names, lines, purpose and tags. No words lists them all.",
    input_schema: { type: 'object', properties: { words: { type: 'string' } } },
  },
  {
    name: 'use_motion',
    description: 'Takes a motion from motionhub.dev into the project, at motions/@<scope>/<slug>/.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: "The motion's id, @<scope>/<slug>." } },
      required: ['id'],
    },
  },
];

/** A path inside the project for `path`, or an error saying why not. */
export function projectPath(dir: string, path: unknown, writing: boolean): string {
  if (typeof path !== 'string' || !path.trim()) throw new Error('A path is needed.');
  const full = resolve(dir, path);
  const inside = relative(dir, full);
  if (inside.startsWith('..') || resolve(dir, inside) !== full || inside.split(sep).includes('..')) {
    throw new Error(`${path} is outside the project.`);
  }
  if (writing) {
    const parts = inside.split(sep);
    if (inside === '' || SKIP.has(parts[0]!)) throw new Error(`${path} is not the agent's to write.`);
    if (parts[0] === 'motions' && parts[1]?.startsWith('@')) {
      throw new Error(`${path} is a motion as published on motionhub, which a project never changes: copy what you need into parts/.`);
    }
  }
  return full;
}

/** Refuse symlinks at every existing component, including the target itself. */
export async function writablePath(dir: string, path: string): Promise<string> {
  const file = projectPath(dir, path, true);
  let at = dir;
  for (const part of relative(dir, file).split(sep)) {
    at = join(at, part);
    try {
      if ((await lstat(at)).isSymbolicLink()) throw new Error(`${path} passes through a symbolic link.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return file;
}

async function write(ctx: ToolContext, path: string, content: string, expected?: string): Promise<void> {
  const file = await writablePath(ctx.dir, path);
  if (ctx.write) return ctx.write(path, content, expected);
  if (expected !== undefined && (await readFile(file, 'utf8')) !== expected) throw new Error(`${path} changed before editing.`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

const text = (value: string, ok = true): ToolOutcome => ({ ok, content: value, text: value });

async function list(dir: string, from: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (out.length >= MAX_LIST) return;
      if (SKIP.has(entry.name)) continue;
      const full = join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  await walk(from);
  return out;
}

const field = (input: Record<string, unknown>, name: string): string => {
  const value = input[name];
  if (typeof value !== 'string') throw new Error(`${name} must be text.`);
  return value;
};

/** Runs one tool call; an error the model can act on comes back as a failed outcome, not a throw. */
export async function runTool(name: string, raw: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof input.invalid_arguments === 'string') {
    return text(`The arguments were not valid JSON, so ${name} did not run: ${input.invalid_arguments.slice(0, 200)}`, false);
  }
  try {
    switch (name) {
      case 'list_files': {
        const from = input.path === undefined ? ctx.dir : projectPath(ctx.dir, input.path, false);
        const files = await list(ctx.dir, from);
        return text(files.length ? files.join('\n') + (files.length >= MAX_LIST ? '\n…' : '') : '(no files)');
      }
      case 'read_file': {
        const content = await readFile(projectPath(ctx.dir, input.path, false), 'utf8');
        return text(content.length > MAX_READ ? `${content.slice(0, MAX_READ)}\n… (cut at ${MAX_READ} characters)` : content);
      }
      case 'write_file': {
        const file = projectPath(ctx.dir, input.path, true);
        await write(ctx, relative(ctx.dir, file), field(input, 'content'));
        return text(`Wrote ${input.path}.`);
      }
      case 'edit_file': {
        const file = projectPath(ctx.dir, input.path, true);
        const before = await readFile(file, 'utf8');
        const oldText = field(input, 'old_text');
        const count = oldText ? before.split(oldText).length - 1 : 0;
        if (count !== 1) return text(`old_text occurs ${count} times in ${input.path}; it must occur exactly once.`, false);
        await write(
          ctx,
          relative(ctx.dir, file),
          before.replace(oldText, () => field(input, 'new_text')),
        );
        return text(`Edited ${input.path}.`);
      }
      case 'check':
        return await check(ctx);
      case 'still':
        return await still(ctx, input.time);
      case 'search_motions': {
        const found = await ctx.searchMotions(typeof input.words === 'string' ? input.words : '');
        if (!found.length) return text('No motion has all of those words.');
        return text(found.map((m) => `${m.id}: ${m.name}. ${m.line}${m.fit ? ` For: ${m.fit}` : ''}`).join('\n'));
      }
      case 'use_motion': {
        const used = await ctx.useMotion(field(input, 'id'));
        return text(`Took ${used.id} into ${used.path.split(sep).join('/')}/. Read its MOTION.md and tokens.json before drawing in it.`);
      }
      default:
        return text(`There is no tool named ${name}.`, false);
    }
  } catch (error) {
    return text(error instanceof Error ? error.message : String(error), false);
  }
}

async function built(ctx: ToolContext): Promise<BuildResult | ToolOutcome> {
  const result = await ctx.build();
  if (!result.ok) return text(`The film does not build:\n${result.errors.join('\n')}`, false);
  return result;
}

async function check(ctx: ToolContext): Promise<ToolOutcome> {
  const result = await built(ctx);
  if ('content' in result) return result;
  const stage = await ctx.stage(result.version);
  try {
    const { seconds, width, height, fps, scenes } = stage.film;
    // Drawn at its start, in the middle of each scene, so an error in any scene shows, and at its end.
    const moments = scenes.map((scene) => scene.start + scene.duration / 2);
    for (const t of [0, ...moments, Math.max(0, seconds - 1 / fps)]) await stage.frame(t);
    const summary = `The film builds and draws: ${seconds} s at ${width}×${height}, ${fps} fps, in ${scenes.length} scene${scenes.length === 1 ? '' : 's'}:`;
    return text([summary, ...scenes.map(outlineLine)].join('\n'));
  } finally {
    stage.close();
  }
}

/** One scene as `check` reports it: its span, its layers' boxes, and what it says. */
function outlineLine(scene: SceneInfo): string {
  const seconds = (s: number) => `${Math.round(s * 100) / 100}`;
  const layers = scene.layers.map((l) => `${l.id} (${l.x},${l.y} ${l.w}×${l.h})`).join(', ') || 'no layers';
  const lines = scene.lines.map((l) => `"${l.text}"`).join(' ');
  return `- ${scene.id}, ${seconds(scene.start)} to ${seconds(scene.start + scene.duration)} s: ${layers}${lines ? `; says ${lines}` : ''}`;
}

async function still(ctx: ToolContext, time: unknown): Promise<ToolOutcome> {
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) return text('time must be a number of seconds.', false);
  const result = await built(ctx);
  if ('content' in result) return result;
  const stage = await ctx.stage(result.version);
  try {
    const at = Math.min(time, stage.film.seconds - 1 / stage.film.fps);
    const image = await stage.frame(at);
    const shown = image.getSize().width > 1280 ? image.resize({ width: 1280 }) : image;
    const jpeg = shown.toJPEG(85).toString('base64');
    const caption = `The frame at ${at.toFixed(2)} s (${stage.film.width}×${stage.film.height}, shown at ${shown.getSize().width} wide).`;
    return {
      ok: true,
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg } },
        { type: 'text', text: caption },
      ],
      text: caption,
      image: `data:image/jpeg;base64,${jpeg}`,
    };
  } finally {
    stage.close();
  }
}
