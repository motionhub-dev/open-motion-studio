import { describe, expect, it, vi } from 'vitest';
import { STUDIO_SERVER, approvalFor, codexInput, codexTurn, sessionConfig, signInCodex, translate, turnEnd, type Reading } from '../codex';
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

describe('a Codex session with the Studio’s tools', () => {
  it('switches off the person’s own servers, apps and plugins, and adds the Studio’s', () => {
    expect(sessionConfig(['pencil', 'node_repl'], 'http://127.0.0.1:5/mcp/x')).toEqual({
      mcp_servers: { pencil: { enabled: false }, node_repl: { enabled: false }, [STUDIO_SERVER]: { url: 'http://127.0.0.1:5/mcp/x' } },
      features: { apps: false, plugins: false },
    });
  });

  it('shows a Studio tool as the built-in agent’s, with a still’s picture and a question’s card', () => {
    const reading: Reading = { said: false };
    expect(translate('item/started', { item: { type: 'mcpToolCall', id: 's', server: STUDIO_SERVER, tool: 'still', arguments: { time: 1.5 } } }, reading)).toEqual([
      { type: 'phase', phase: 'reviewing' },
      { type: 'tool', id: 's', name: 'still', summary: 'Looking at 1.5 s', at: 1.5 },
    ]);
    expect(
      translate('item/completed', { item: { type: 'mcpToolCall', id: 's', status: 'completed', result: { content: [{ type: 'text', text: 'At 1.5 s' }, { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }] } } }, reading),
    ).toEqual([{ type: 'tool-result', id: 's', ok: true, text: 'At 1.5 s', image: 'data:image/jpeg;base64,AAAA' }]);
    expect(translate('item/started', { item: { type: 'mcpToolCall', id: 'q', server: STUDIO_SERVER, tool: 'ask_person', arguments: { question: 'Calm or bold?', options: ['Calm', 'Bold'] } } }, reading)[1]).toMatchObject({
      ask: { question: 'Calm or bold?', options: ['Calm', 'Bold'] },
    });
  });
});

describe('what Codex asks leave to do', () => {
  const place = (path: string) => (path.startsWith('motions/@') ? 'protected' : path.startsWith('../') ? 'outside' : 'project') as never;

  it('grants the Studio’s own tools and declines any other server’s', () => {
    expect(approvalFor('mcpServer/elicitation/request', { serverName: STUDIO_SERVER }, [], place)).toEqual({ answer: { action: 'accept', content: {}, _meta: null } });
    expect(approvalFor('mcpServer/elicitation/request', { serverName: 'pencil' }, [], place)).toEqual({ answer: { action: 'decline', content: null, _meta: null } });
  });

  it('allows an edit in the project, refuses one into a protected path, and asks for one elsewhere', () => {
    expect(approvalFor('item/fileChange/requestApproval', {}, ['film.tsx', 'parts/a.tsx'], place)).toEqual({ answer: { decision: 'accept' } });
    expect(approvalFor('item/fileChange/requestApproval', {}, ['film.tsx', 'motions/@hub/look/tokens.json'], place)).toEqual({ answer: { decision: 'decline' } });
    const elsewhere = approvalFor('item/fileChange/requestApproval', { reason: 'Shared styles' }, ['../shared/a.css'], place);
    expect(elsewhere).toMatchObject({ ask: { title: 'Codex asks to change files outside the project', detail: '../shared/a.css', reason: 'Shared styles' } });
    if (!('ask' in elsewhere)) throw new Error('should ask');
    expect([elsewhere.answer('once'), elsewhere.answer('session'), elsewhere.answer('deny')]).toEqual([
      { decision: 'accept' },
      { decision: 'acceptForSession' },
      { decision: 'decline' },
    ]);
  });

  it('asks before a command, and grants permissions only as asked', () => {
    expect(approvalFor('item/commandExecution/requestApproval', { command: 'npm install' }, [], place)).toMatchObject({ ask: { title: 'Codex asks to run a command', detail: 'npm install' } });
    const network = approvalFor('item/permissions/requestApproval', { permissions: { network: { enabled: true }, fileSystem: null } }, [], place);
    if (!('ask' in network)) throw new Error('should ask');
    expect(network.ask.title).toBe('Codex asks for the network');
    expect(network.answer('session')).toEqual({ permissions: { network: { enabled: true } }, scope: 'session' });
    expect(network.answer('deny')).toEqual({ permissions: {}, scope: 'turn' });
    expect(() => approvalFor('attestation/generate', {}, [], place)).toThrow();
  });
});

describe('signing in to Codex', () => {
  const fake = (authUrl: string, completed: Record<string, unknown> | null) => {
    let listener: (method: string, params: Record<string, unknown>) => void = () => {};
    return {
      server: {
        on: (l: typeof listener) => ((listener = l), () => undefined),
        request: async () => ({ type: 'chatgpt', loginId: 'l', authUrl }),
        ended: new Promise<void>(() => undefined),
        lastWords: () => '',
      } as never,
      open: vi.fn(() => completed && setTimeout(() => listener('account/login/completed', completed))),
    };
  };

  it('opens Codex’s own sign-in page and settles when Codex says it completed', async () => {
    const { server, open } = fake('https://auth.openai.com/oauth?x=1', { success: true, error: null });
    await signInCodex(server, open);
    expect(open).toHaveBeenCalledWith('https://auth.openai.com/oauth?x=1');
  });

  it('says why a sign-in failed, and opens nothing that is not https', async () => {
    const failed = fake('https://auth.openai.com/oauth', { success: false, error: 'Cancelled' });
    await expect(signInCodex(failed.server, failed.open)).rejects.toThrow('Cancelled');
    const odd = fake('file:///etc/passwd', null);
    await expect(signInCodex(odd.server, odd.open)).rejects.toThrow('sign-in page');
    expect(odd.open).not.toHaveBeenCalled();
  });
});

describe('what a Codex turn took', () => {
  it('adds up the model calls Codex reports under the turn, and no other turn’s', async () => {
    let listener: (method: string, params: Record<string, unknown>) => void = () => {};
    const call = (turnId: string, input: number, cached: number, output: number, reasoning: number) =>
      listener('thread/tokenUsage/updated', {
        threadId: 'th',
        turnId,
        tokenUsage: { last: { inputTokens: input, cachedInputTokens: cached, cacheWriteInputTokens: 0, outputTokens: output, reasoningOutputTokens: reasoning } },
      });
    const server = {
      on: (l: typeof listener) => ((listener = l), () => undefined),
      request: async () => {
        setTimeout(() => {
          call('an-earlier-turn', 5000, 0, 50, 0);
          // As Codex 0.167 reported them: its input includes the cached part, its output the reasoning.
          call('t1', 16784, 0, 54, 0);
          call('t1', 16866, 16640, 31, 6);
          listener('turn/completed', { threadId: 'th', turn: { id: 't1', status: 'completed' } });
        });
        return { turn: { id: 't1' } };
      },
      ended: new Promise<void>(() => undefined),
      lastWords: () => '',
    } as never;
    const outcome = await codexTurn(server, 'th', [], () => undefined, new AbortController().signal, async () => 'deny', () => 'project');
    expect(outcome.spent).toEqual({ tokens: { input: 17010, cacheRead: 16640, cacheWrite: 0, output: 85, reasoning: 6 }, calls: 2 });
  });
});
