// The coding agents a person may already have (ADR 0008): where each one's vendor installs it, whether its version
// speaks the protocol the Studio speaks, and so the one thing to do next. The Studio looks only where the vendor's
// installer puts the CLI, never in a project or along PATH, and never reads the person's sign-in itself: Codex says
// whether it is signed in through its app-server (codex.ts).

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HarnessState } from '../../shared/api';

/** The versions of `codex app-server` the Studio was written and tested against: an older one may lack what it uses. */
export const CODEX_MIN = '0.167.0';

/** Where OpenAI's installers put `codex`, on this platform. */
export function codexPlaces(platform: NodeJS.Platform = process.platform, home = homedir(), env = process.env): string[] {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    return [join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')];
  }
  return [join(home, '.local', 'bin', 'codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex'];
}

/** The parts of a version (`codex-cli 0.167.0` → [0, 167, 0]), or null when there is none. */
export function versionOf(text: string): number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? match.slice(1).map(Number) : null;
}

/** Whether `version` is at least `min`. */
export function atLeast(version: number[], min: string): boolean {
  const floor = versionOf(min)!;
  for (let i = 0; i < 3; i++) if (version[i] !== floor[i]) return version[i]! > floor[i]!;
  return true;
}

const run = (file: string, args: string[]) =>
  new Promise<string>((done, fail) =>
    execFile(file, args, { timeout: 15000, windowsHide: true }, (error, stdout) => (error ? fail(error) : done(stdout))),
  );

/** Codex on this machine: not installed, too old, or found (its sign-in is asked of its app-server). */
export async function findCodex(): Promise<{ state: Extract<HarnessState, 'missing' | 'old'>; version?: string } | { state: 'found'; bin: string; version: string }> {
  for (const bin of codexPlaces()) {
    try {
      await access(bin);
    } catch {
      continue;
    }
    const said = await run(bin, ['--version']);
    const version = versionOf(said);
    if (!version) throw new Error(`Codex at ${bin} did not say its version.`);
    return atLeast(version, CODEX_MIN) ? { state: 'found', bin, version: version.join('.') } : { state: 'old', version: version.join('.') };
  }
  return { state: 'missing' };
}

/** Where the person installs Codex, shown when it is not installed: OpenAI's own page, not a command of ours. */
export const CODEX_INSTALL = 'https://developers.openai.com/codex';
