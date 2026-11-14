// The coding agents a person may already have (ADR 0008): where each one's vendor installs it, whether its version
// speaks the protocol the Studio speaks, and so the one thing to do next. The Studio looks only where the vendor's
// installer puts the CLI, never in a project or along PATH, and never reads the person's sign-in itself: Codex says
// whether it is signed in through its app-server (codex.ts), Claude Code through `claude auth status`.

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HarnessState, NoticeNeed } from '../../shared/api';

/** Why an agent cannot take a message, with what the person needs to do about it. */
export class AgentProblem extends Error {
  constructor(
    message: string,
    readonly need: NoticeNeed,
  ) {
    super(message);
  }
}

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

/** What a CLI prints; `anyExit` keeps what it printed when it exits non-zero, as `claude auth status` does signed out. */
const run = (file: string, args: string[], env: NodeJS.ProcessEnv = process.env, anyExit = false) =>
  new Promise<string>((done, fail) =>
    execFile(file, args, { timeout: 15000, windowsHide: true, env }, (error, stdout) =>
      error && !(anyExit && stdout.trim()) ? fail(error) : done(stdout),
    ),
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

/** Where the person installs or updates Codex: OpenAI's own page, not a command of ours. */
export const CODEX_INSTALL = 'https://developers.openai.com/codex';

/** The version of Claude Code the Studio was written and tested against (`claude -p` with stream-json in and out). */
export const CLAUDE_MIN = '2.1.71';

/** The efforts Claude Code takes (`claude --help`, 2.1). */
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Where Anthropic's native installer puts `claude`, on every platform. */
export function claudePlaces(platform: NodeJS.Platform = process.platform, home = homedir()): string[] {
  return [join(home, '.local', 'bin', platform === 'win32' ? 'claude.exe' : 'claude')];
}

/**
 * The environment a `claude` child runs with: the person's own, without what a Claude Code session the Studio was
 * started from would pass on (CLAUDECODE and CLAUDE_CODE_*, its session and tokens), which `claude` refuses to run under.
 */
export function claudeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^CLAUDE(CODE$|_)/i.test(key)));
}

/** Claude Code on this machine: not installed, too old, or found with whether it is signed in (`claude auth status`). */
export async function findClaude(): Promise<
  { state: Extract<HarnessState, 'missing' | 'old'>; version?: string } | { state: 'found'; bin: string; version: string; signedIn: boolean }
> {
  for (const bin of claudePlaces()) {
    try {
      await access(bin);
    } catch {
      continue;
    }
    const version = versionOf(await run(bin, ['--version'], claudeEnv()));
    if (!version) throw new Error(`Claude Code at ${bin} did not say its version.`);
    if (!atLeast(version, CLAUDE_MIN)) return { state: 'old', version: version.join('.') };
    const status = JSON.parse(await run(bin, ['auth', 'status', '--json'], claudeEnv(), true)) as { loggedIn?: boolean };
    return { state: 'found', bin, version: version.join('.'), signedIn: status.loggedIn === true };
  }
  return { state: 'missing' };
}

/** Where the person installs or updates Claude Code: Anthropic's own page. */
export const CLAUDE_INSTALL = 'https://docs.anthropic.com/en/docs/claude-code/setup';
