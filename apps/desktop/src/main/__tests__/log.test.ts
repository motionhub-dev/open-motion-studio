import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RuntimeLog } from '../log';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'oms-log-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it('persists spawn diagnostics as one JSON line and appends across restarts', () => {
  const first = new RuntimeLog(root);
  const error = Object.assign(new Error('spawn ENOTDIR'), { code: 'ENOTDIR', syscall: 'spawn', path: '/Applications/OpenMotionStudio.app/Contents/Resources/app.asar/node_modules/@esbuild/darwin-arm64/bin/esbuild' });
  first.write('film.bundler-failed', { error, projectPath: '/Users/creator/Documents/OpenMotionStudio/Untitled film' });
  new RuntimeLog(root).write('app.start', { platform: 'darwin', arch: 'arm64' });
  const records = readFileSync(first.file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ event: 'film.bundler-failed', fields: { error: { code: 'ENOTDIR', syscall: 'spawn', path: error.path } } });
  expect(records[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(records[1].fields).toMatchObject({ platform: 'darwin', arch: 'arm64' });
});

it('redacts credentials and conversation-shaped fields, including common secrets in errors', () => {
  const log = new RuntimeLog(root);
  log.write('request.failed', { apiKey: 'plain-secret', nested: { token: 'token-value', authorization: 'Bearer abc' },
    prompt: 'private prompt', messages: ['private message'], env: { SOMETHING: 'private environment' }, args: ['private args'],
    error: new Error('Bearer opaque-value api_key=another-value sk-private-key') });
  const output = readFileSync(log.file, 'utf8');
  for (const secret of ['plain-secret', 'token-value', 'Bearer abc', 'private prompt', 'private message', 'private environment', 'private args', 'opaque-value', 'another-value', 'sk-private-key']) expect(output).not.toContain(secret);
  expect(output).toContain('[redacted]');
});

it('keeps only a bounded current log and previous log, including when a single record is too large', () => {
  const log = new RuntimeLog(root, 500);
  for (let i = 0; i < 15; i++) log.write('event', { index: i, value: 'x'.repeat(100) });
  log.write('large', { value: 'x'.repeat(6000) });
  expect(readdirSync(root).sort()).toEqual(['main.log', 'main.log.1']);
  for (const name of readdirSync(root)) expect(Buffer.byteLength(readFileSync(join(root, name)))).toBeLessThanOrEqual(500);
  expect(readFileSync(log.file, 'utf8')).toContain('"truncated":true');
});

it('does not turn an unwritable log location into an app failure', () => {
  const file = join(root, 'file'); writeFileSync(file, 'keep');
  const log = new RuntimeLog(file);
  expect(() => log.write('event')).not.toThrow();
  expect(() => log.write('event.again')).not.toThrow();
  expect(readFileSync(file, 'utf8')).toBe('keep');
});
