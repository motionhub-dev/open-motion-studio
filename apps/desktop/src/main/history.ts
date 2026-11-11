// Local checkpoints contain only files written through the agent. Restoring checks every
// affected file before touching any of them; external edits are never silently replaced.
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { Checkpoint } from '../shared/api';
import { writablePath } from './agent/tools';
import { STATE_DIR } from './project';

type Change = { path: string; before: string | null; after: string | null };
type Entry = Omit<Checkpoint, 'files'> & { changes: Change[] };

async function contents(file: string): Promise<string | null> {
  try {
    return (await readFile(file)).toString('base64');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function replace(file: string, value: string | null): Promise<void> {
  if (value === null) {
    await unlink(file);
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  const temp = join(dirname(file), `.oms-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, Buffer.from(value, 'base64'), { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

export class ProjectHistory {
  private entry: Entry | null = null;
  constructor(
    private dir: string,
    private label = '',
  ) {}

  private async file(): Promise<string> {
    const folder = join(this.dir, STATE_DIR);
    try {
      if ((await lstat(folder)).isSymbolicLink()) throw new Error('The project state must not be a symbolic link.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(folder, { recursive: true });
    const file = join(folder, 'history.json');
    try {
      if ((await lstat(file)).isSymbolicLink()) throw new Error('The checkpoint file must not be a symbolic link.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return file;
  }

  private async read(): Promise<Entry[]> {
    const raw = await contents(await this.file());
    if (raw === null) return [];
    const entries: Entry[] = JSON.parse(Buffer.from(raw, 'base64').toString());
    if (
      !Array.isArray(entries) ||
      entries.some(
        (e) =>
          typeof e.id !== 'string' ||
          typeof e.label !== 'string' ||
          !Array.isArray(e.changes) ||
          e.changes.some(
            (c) =>
              typeof c.path !== 'string' ||
              (c.before !== null && typeof c.before !== 'string') ||
              (c.after !== null && typeof c.after !== 'string'),
          ),
      )
    ) {
      throw new Error('The checkpoint history could not be read. Project files have not been changed.');
    }
    return entries;
  }

  private async save(entries: Entry[]): Promise<void> {
    const file = await this.file();
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(entries), { flag: 'wx' });
    await rename(temp, file);
  }

  async list(): Promise<Checkpoint[]> {
    return (await this.read())
      .slice()
      .reverse()
      .map(({ changes, ...entry }) => ({ ...entry, files: changes.filter((c) => c.before !== c.after).map((c) => c.path) }))
      .filter((entry) => entry.files.length > 0);
  }

  async write(path: string, text: string, expected?: string): Promise<void> {
    const file = await writablePath(this.dir, path);
    const before = await contents(file);
    if (expected !== undefined && Buffer.from(expected).toString('base64') !== before)
      throw new Error(`${path} changed while the edit was being prepared. Read it again before editing.`);
    const after = Buffer.from(text).toString('base64');
    if (before === after) return;
    const entries = await this.read();
    if (!this.entry) {
      this.entry = {
        id: randomUUID(),
        label: this.label.slice(0, 160) || 'Agent changes',
        createdAt: new Date().toISOString(),
        changes: [],
      };
      entries.push(this.entry);
    } else {
      const index = entries.findIndex((e) => e.id === this.entry!.id);
      if (index < 0) throw new Error('The checkpoint was removed while editing.');
      this.entry = entries[index]!;
    }
    const pathInProject = relative(this.dir, file);
    const change = this.entry.changes.find((c) => c.path === pathInProject);
    if (change && change.after !== before)
      throw new Error(`${path} changed outside the agent. Read it again in a new turn before editing.`);
    if (change) change.after = after;
    else this.entry.changes.push({ path: pathInProject, before, after });
    // Save the recovery information before changing the source file.
    await this.save(entries);
    try {
      if ((await contents(file)) !== before) throw new Error(`${path} changed before the edit was saved. Your edits were kept.`);
      await replace(file, after);
    } catch (error) {
      // A failed atomic write left the original file in place; keep the journal truthful.
      const recorded = this.entry.changes.find((c) => c.path === pathInProject)!;
      recorded.after = before;
      await this.save(entries);
      throw error;
    }
  }

  async restore(id: string): Promise<void> {
    const entries = await this.read();
    const index = entries.findIndex((e) => e.id === id);
    if (index < 0) throw new Error('That checkpoint no longer exists.');
    const changes = new Map<string, Change>();
    for (const entry of entries.slice(index).reverse()) {
      for (const change of entry.changes) {
        // Each file goes back to how it was before the earliest checkpoint restored. A hand edit made between two
        // of them is not lost: the later checkpoint keeps it as its before, and this restoration can be undone.
        const existing = changes.get(change.path);
        if (existing) existing.before = change.before;
        else changes.set(change.path, { ...change });
      }
    }
    for (const change of changes.values()) {
      const file = await writablePath(this.dir, change.path);
      if ((await contents(file)) !== change.after)
        throw new Error(`${change.path} changed outside the agent. Keep a copy of your edits before restoring.`);
    }
    const inverse: Entry = {
      id: randomUUID(),
      label: entries[index]!.label,
      restored: true,
      createdAt: new Date().toISOString(),
      changes: [...changes.values()].filter((c) => c.before !== c.after).map((c) => ({ path: c.path, before: c.after, after: c.before })),
    };
    await this.save([...entries, inverse]);
    const applied: Change[] = [];
    try {
      for (const change of inverse.changes) {
        const file = await writablePath(this.dir, change.path);
        if ((await contents(file)) !== change.before) throw new Error(`${change.path} changed while restoring. Your edits were kept.`);
        await replace(file, change.after);
        applied.push(change);
      }
    } catch (error) {
      for (const change of applied.reverse()) {
        const file = await writablePath(this.dir, change.path);
        if ((await contents(file)) !== change.after)
          throw new Error(`Restoration stopped because ${change.path} changed. Its recovery copy is retained in History.`);
        await replace(file, change.before);
      }
      await this.save(entries);
      throw error;
    }
  }
}
