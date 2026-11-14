import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../../shared/api';
import { CLAUDE_TOOLS, ClaudeSession, claudeArgs, resultNotice, translateClaude, type ClaudeReading } from '../claude';
import { claudeEnv, claudePlaces } from '../harness';

vi.mock('electron', () => ({}));

describe('a Claude Code session', () => {
  it('starts with the Studio settings alone: no setting sources, only its MCP server, a fixed set of tools', () => {
    const args = claudeArgs('THE SKILL', 'http://127.0.0.1:5/mcp/x', { id: 'abc', resume: false });
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args[0]).toBe('-p');
    expect(after('--input-format')).toBe('stream-json');
    expect(after('--output-format')).toBe('stream-json');
    expect(after('--setting-sources')).toBe('');
    expect(args).toContain('--strict-mcp-config');
    expect(JSON.parse(after('--mcp-config')!)).toEqual({ mcpServers: { open_motion_studio: { type: 'http', url: 'http://127.0.0.1:5/mcp/x' } } });
    expect(after('--tools')).toBe(CLAUDE_TOOLS.join(','));
    expect(CLAUDE_TOOLS).not.toContain('Bash');
    expect(CLAUDE_TOOLS).not.toContain('WebFetch');
    expect(after('--append-system-prompt')).toBe('THE SKILL');
    expect(after('--session-id')).toBe('abc');
    expect(claudeArgs('s', 'u', { id: 'abc', resume: true })).toContain('--resume');
  });

  it('runs without what a Claude Code session it was started from would pass on', () => {
    expect(claudeEnv({ PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_CODE_MESSAGING_TOKEN: 't', HOME: '/h' })).toEqual({
      PATH: '/bin',
      HOME: '/h',
    });
    expect(claudePlaces('win32', 'C:/Users/me')[0]).toMatch(/\.local.bin.claude\.exe$/);
  });

  it('reads its stream as the panel events, a Studio tool as the built-in agent would show it', () => {
    const reading: ClaudeReading = { said: false, tools: new Map() };
    const events = [
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Looking.' } } },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Looking.' },
            { type: 'tool_use', id: 'a', name: 'Edit', input: { file_path: 'film.tsx' } },
            { type: 'tool_use', id: 'b', name: 'mcp__open_motion_studio__still', input: { time: 2 } },
            { type: 'tool_use', id: 'c', name: 'mcp__open_motion_studio__ask_person', input: { question: 'Calm or bold?', options: ['Calm'] } },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'a', content: 'Edited.' },
            {
              type: 'tool_result',
              tool_use_id: 'b',
              content: [
                { type: 'text', text: 'At 2 s' },
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AA' } },
              ],
            },
            { type: 'tool_result', tool_use_id: 'z', content: 'not ours' },
          ],
        },
      },
      { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } },
    ].flatMap((event) => translateClaude(event, reading));
    expect(events).toEqual([
      { type: 'text', text: 'Looking.' },
      { type: 'phase', phase: 'editing' },
      { type: 'tool', id: 'a', name: 'edit_file', summary: 'Editing film.tsx', at: undefined },
      { type: 'phase', phase: 'reviewing' },
      { type: 'tool', id: 'b', name: 'still', summary: 'Looking at 2.0 s', at: 2 },
      { type: 'phase', phase: 'reviewing' },
      { type: 'tool', id: 'c', name: 'ask_person', summary: 'Asking you', at: undefined, ask: { question: 'Calm or bold?', options: ['Calm'] } },
      { type: 'tool-result', id: 'a', ok: true, text: 'Edited.' },
      { type: 'tool-result', id: 'b', ok: true, text: 'At 2 s', image: 'data:image/jpeg;base64,AA' },
      { type: 'text', text: '\n\n' },
    ]);
  });

  it('says plainly when Claude Code is not signed in', () => {
    expect(resultNotice({ type: 'result', is_error: false })).toBeUndefined();
    expect(resultNotice({ type: 'result', is_error: true, result: 'Not logged in. Please run /login' })?.text).toMatch(/claude auth login/);
    expect(resultNotice({ type: 'result', is_error: true, result: 'Rate limited' })).toEqual({ text: 'Rate limited', error: true });
  });

  it('runs turns one after another on one process, and Stop ends it', async () => {
    const script = join(__dirname, 'fixtures', 'fake-claude.mjs');
    const session = new ClaudeSession(process.execPath, __dirname, [script]);
    const events: AgentEvent[] = [];
    const first = await session.turn([{ type: 'text', text: 'hello' }], (e) => events.push(e), new AbortController().signal);
    // What the turn took, from its result.
    expect(first).toEqual({
      ok: true,
      notice: undefined,
      spent: { tokens: { input: 100, cacheRead: 1000, cacheWrite: 0, output: 20, reasoning: 0 }, calls: 1, model: 'claude-sonnet-5-5', costUsd: 0.01 },
    });
    expect(events).toContainEqual({ type: 'text', text: 'Turn 1: hello' });
    expect(events).toContainEqual({ type: 'tool-result', id: 't1', ok: true, text: 'export default' });
    const second = await session.turn([{ type: 'text', text: 'fail' }], () => undefined, new AbortController().signal);
    expect(second.ok).toBe(false);
    const stop = new AbortController();
    const hanging = session.turn([{ type: 'text', text: 'hang' }], () => undefined, stop.signal);
    stop.abort();
    expect(await hanging).toMatchObject({ ok: false, notice: { text: 'Stopped.', error: false } });
  });

  it('takes a message sent mid-turn into the turn, whether Claude Code takes it in before its result or after', async () => {
    const script = join(__dirname, 'fixtures', 'fake-claude.mjs');
    const session = new ClaudeSession(process.execPath, __dirname, [script]);
    const signal = new AbortController().signal;
    const until = async (seen: () => boolean) => {
      for (let i = 0; i < 200 && !seen(); i++) await new Promise((done) => setTimeout(done, 10));
    };
    try {
      expect(session.steer([{ type: 'text', text: 'too soon' }])).toBe(false);

      // Taken in before the turn's result: one turn, which answers it.
      const joined: AgentEvent[] = [];
      const slow = session.turn([{ type: 'text', text: 'slow' }], (e) => joined.push(e), signal);
      await until(() => joined.some((e) => e.type === 'tool'));
      expect(session.steer([{ type: 'text', text: 'and blue' }])).toBe(true);
      expect(await slow).toMatchObject({ ok: true, notice: undefined, spent: { calls: 1 } });
      expect(joined).toContainEqual({ type: 'text', text: 'Took in: and blue' });

      // Taken in after it: Claude Code runs it as a turn of its own, which the Studio's turn waits for.
      const ran: AgentEvent[] = [];
      const late = session.turn([{ type: 'text', text: 'late' }], (e) => ran.push(e), signal);
      await until(() => ran.some((e) => e.type === 'tool'));
      expect(session.steer([{ type: 'text', text: 'and red' }])).toBe(true);
      // Two results, one turn: their accounts added up.
      expect(await late).toMatchObject({ ok: true, notice: undefined, spent: { calls: 2, tokens: { input: 200, output: 40 }, costUsd: 0.02 } });
      expect(ran).toContainEqual({ type: 'text', text: 'Turn 3: and red' });

      // The next turn is its own: no result of the last one is left to end it early.
      const after: AgentEvent[] = [];
      expect(await session.turn([{ type: 'text', text: 'next' }], (e) => after.push(e), signal)).toMatchObject({ ok: true, notice: undefined, spent: { calls: 1 } });
      expect(after).toContainEqual({ type: 'text', text: 'Turn 4: next' });
      expect(session.steer([{ type: 'text', text: 'between turns' }])).toBe(false);
    } finally {
      session.close();
    }
  });
});
