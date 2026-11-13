import { describe, expect, it, vi } from 'vitest';
import { codexInput, translate, turnEnd, type Reading } from '../codex';
import { atLeast, codexPlaces, versionOf } from '../harness';

vi.mock('electron', () => ({}));

describe('a turn of Codex, as the panel tells it', () => {
  it('turns its words, commands, file changes and tool calls into the panel events', () => {
    const reading: Reading = { said: false };
    const events = [
      translate('item/started', { item: { type: 'reasoning', id: 'r' } }, reading),
      translate('item/agentMessage/delta', { delta: 'Looking.' }, reading),
      translate('item/started', { item: { type: 'commandExecution', id: 'c', command: 'rg Scene film.tsx' } }, reading),
      translate('item/completed', { item: { type: 'commandExecution', id: 'c', status: 'completed', exitCode: 0, aggregatedOutput: 'film.tsx:7' } }, reading),
      translate('item/started', { item: { type: 'fileChange', id: 'f', changes: [{ path: 'film.tsx' }, { path: 'parts/title.tsx' }] } }, reading),
      translate('item/completed', { item: { type: 'fileChange', id: 'f', status: 'completed', changes: [{ path: 'film.tsx', kind: { type: 'update' } }] } }, reading),
      translate('item/started', { item: { type: 'agentMessage', id: 'm2' } }, reading),
      translate('item/completed', { item: { type: 'commandExecution', id: 'x', status: 'failed', exitCode: 2, aggregatedOutput: null } }, reading),
    ].flat();
    expect(events).toEqual([
      { type: 'phase', phase: 'thinking' },
      { type: 'text', text: 'Looking.' },
      { type: 'phase', phase: 'reviewing' },
      { type: 'tool', id: 'c', name: 'shell', summary: 'Running rg Scene film.tsx' },
      { type: 'tool-result', id: 'c', ok: true, text: 'film.tsx:7' },
      { type: 'phase', phase: 'editing' },
      { type: 'tool', id: 'f', name: 'edit_file', summary: 'Editing film.tsx and 1 more' },
      { type: 'tool-result', id: 'f', ok: true, text: 'update film.tsx' },
      { type: 'text', text: '\n\n' },
      { type: 'tool-result', id: 'x', ok: false, text: 'Exit code 2.' },
    ]);
  });

  it('says how a turn ended', () => {
    expect(turnEnd({ turn: { status: 'completed' } })).toBeUndefined();
    expect(turnEnd({ turn: { status: 'interrupted' } })).toEqual({ text: 'Stopped.', error: false });
    expect(turnEnd({ turn: { status: 'failed', error: { message: 'Usage limit reached' } } })).toEqual({ text: 'Usage limit reached', error: true });
  });

  it('gives Codex the person’s message as one text and its frames as images', () => {
    expect(
      codexInput([
        { type: 'text', text: 'Make 1 bigger' },
        { type: 'text', text: '<marks>…</marks>' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      ]),
    ).toEqual([
      { type: 'text', text: 'Make 1 bigger\n\n<marks>…</marks>', text_elements: [] },
      { type: 'image', url: 'data:image/jpeg;base64,AAAA' },
    ]);
  });
});

describe('finding Codex', () => {
  it('looks only where OpenAI installs it', () => {
    expect(codexPlaces('win32', 'C:/Users/me', { LOCALAPPDATA: 'C:/Users/me/AppData/Local' })[0]).toMatch(/OpenAI.Codex.bin.codex\.exe$/);
    expect(codexPlaces('darwin', '/Users/me', {})).toContain('/opt/homebrew/bin/codex');
  });

  it('reads and compares its version', () => {
    expect(versionOf('codex-cli 0.167.0')).toEqual([0, 167, 0]);
    expect(versionOf('nothing')).toBeNull();
    expect(atLeast([0, 167, 0], '0.167.0')).toBe(true);
    expect(atLeast([0, 168, 1], '0.167.0')).toBe(true);
    expect(atLeast([0, 99, 9], '0.167.0')).toBe(false);
  });
});
