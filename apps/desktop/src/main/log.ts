// Local diagnostics only: bounded JSON lines, no IPC arguments, model messages, credentials or environment dumps.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const stderr = console.error.bind(console);
const PRIVATE = /^(?:.*(?:password|secret|token|api.?key|authorization|cookie)|key|messages|prompt|content|args|env)$/i;

function clean(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[omitted]';
  if (value instanceof Error) {
    const error = value as NodeJS.ErrnoException;
    return clean({ name: error.name, message: error.message, stack: error.stack, code: error.code,
      syscall: error.syscall, path: error.path, cause: error.cause }, depth + 1);
  }
  if (typeof value === 'string') return value
    .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, '$1 [redacted]')
    .replace(/\bsk-[\w-]+/g, '[redacted]')
    .replace(/(["']?\b(?:api[_-]?key|access[_-]?token|token|key|password|secret|authorization)["']?\s*[=:]\s*["']?)[^\s"'&,;]+/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
    .slice(0, 6000);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => clean(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 30)
    .map(([key, item]) => [key, PRIVATE.test(key) ? '[redacted]' : clean(item, depth + 1)]));
  return typeof value === 'bigint' ? String(value) : value;
}

/** Two files at most. Rotation happens before appending, including across app restarts. */
export class RuntimeLog {
  readonly file: string;
  private failed = false;
  constructor(readonly directory: string, private readonly limit = 5 * 1024 * 1024) {
    this.file = join(directory, 'main.log');
  }
  write(event: string, fields: Record<string, unknown> = {}): void {
    if (this.failed) return;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      let line = JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event, fields: clean(fields) });
      if (Buffer.byteLength(line) > this.limit) line = JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event, truncated: true });
      if (existsSync(this.file) && statSync(this.file).size + Buffer.byteLength(line) + 1 > this.limit) renameSync(this.file, `${this.file}.1`);
      appendFileSync(this.file, `${line}\n`, { mode: 0o600 });
    } catch (error) {
      this.failed = true;
      // Logging must not stop creation or recursively try to log its own disk failure.
      stderr('OpenMotionStudio could not write its runtime log:', (error as NodeJS.ErrnoException).code);
    }
  }
}

let runtime: RuntimeLog | undefined;
export function useRuntimeLog(directory: string): void { runtime = new RuntimeLog(directory); }
export function log(event: string, fields: Record<string, unknown> = {}): void { runtime?.write(event, fields); }
export function logFailure(event: string, error: unknown, fields: Record<string, unknown> = {}): void { log(event, { ...fields, error }); }
