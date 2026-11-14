import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../../shared/api';
import { MAX_CALLS, runTurn, transcript } from '../loop';
import type { Message, MessageParam } from '../model';
import type { ToolContext } from '../tools';

vi.mock('electron', () => ({}));

const reply = (content: Message['content'], stop: Message['stop_reason'] = 'end_turn', usage?: Record<string, number>) =>
  ({ id: 'msg', type: 'message', role: 'assistant', model: 'm', content, stop_reason: stop, usage }) as unknown as Message;

const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as Message['content'][number];
const say = (text: string) => ({ type: 'text', text, citations: null }) as Message['content'][number];

function setup(replies: Message[]) {
  const events: AgentEvent[] = [];
  const messages: MessageParam[] = [];
  const call = vi.fn(async (_m: MessageParam[], onText: (t: string) => void) => {
    const next = replies.shift();
    if (!next) throw new Error('no more replies');
    for (const block of next.content) if (block.type === 'text') onText(block.text);
    return next;
  });
  const tools: ToolContext = {
    dir: '/nowhere',
    build: vi.fn(),
    stage: vi.fn(),
    searchMotions: vi.fn().mockResolvedValue([]),
    useMotion: vi.fn(),
    voiceKinds: vi.fn(),
    voiceChoices: vi.fn(),
    voiceFilm: vi.fn(),
  };
  const controller = new AbortController();
  const turn = {
    messages,
    content: 'Make a film',
    call,
    tools,
    emit: (e: AgentEvent) => events.push(e),
    save: vi.fn(),
    signal: controller.signal,
  };
  return { events, messages, call, turn, controller };
}

describe('runTurn', () => {
  it('runs the tools the model asks for and sends their results back, until it ends its turn', async () => {
    const { events, messages, call, turn } = setup([
      reply([say('Looking.'), use('t1', 'search_motions', { words: 'ocean' })], 'tool_use', { input_tokens: 900, cache_read_input_tokens: 4000, output_tokens: 60 }),
      reply([say('Done.')], 'end_turn', { input_tokens: 120, cache_read_input_tokens: 4900, cache_creation_input_tokens: 80, output_tokens: 15 }),
    ]);
    await runTurn(turn, String);
    expect(call).toHaveBeenCalledTimes(2);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages[2]!.content).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: 'No motion has all of those words.' }]);
    // The turn's account: its two calls' tokens added up, and its time.
    expect(events.at(-1)).toEqual({
      type: 'end',
      notice: undefined,
      usage: { input: 1020, cacheRead: 8900, cacheWrite: 80, output: 75, reasoning: 0, calls: 2, seconds: expect.any(Number) },
    });
    expect(transcript(messages).map((i) => i.kind)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('answers every tool call even when the reply is cut off, so the conversation stays valid', async () => {
    const { messages, turn, events } = setup([reply([use('t1', 'write_file', { path: 'film.tsx' })], 'max_tokens')]);
    await runTurn(turn, String);
    expect(messages.at(-1)!.content).toEqual([{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Not run.' }]);
    expect(events.at(-1)).toMatchObject({ type: 'end', notice: { error: true } });
  });

  it('stops after MAX_CALLS model calls', async () => {
    const replies = Array.from({ length: MAX_CALLS + 1 }, (_, i) => reply([use(`t${i}`, 'search_motions', {})], 'tool_use'));
    const { call, turn, events } = setup(replies);
    await runTurn(turn, String);
    expect(call).toHaveBeenCalledTimes(MAX_CALLS);
    expect(events.at(-1)).toMatchObject({ type: 'end', notice: { error: false } });
  });

  it('ends with the provider’s reason when a call fails', async () => {
    const { turn, events } = setup([]);
    expect(await runTurn(turn, () => 'The provider refused the key.')).toEqual({ ok: false });
    expect(events.at(-1)).toMatchObject({ type: 'end', notice: { text: 'The provider refused the key.', error: true }, usage: { calls: 0 } });
  });

  it('answers the calls it did not run when the person stops it', async () => {
    const { messages, turn, controller } = setup([reply([use('t1', 'search_motions', {}), use('t2', 'search_motions', {})], 'tool_use')]);
    turn.tools.searchMotions = vi.fn(async () => {
      controller.abort();
      return [];
    });
    await runTurn(turn, String);
    const results = messages.at(-1)!.content as { tool_use_id: string; is_error?: boolean }[];
    expect(results.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ['t1', false],
      ['t2', true],
    ]);
  });
});

describe('ask_person', () => {
  it('shows the question with its answers and ends the turn without calling the model again', async () => {
    const { events, messages, call, turn } = setup([
      reply([use('q1', 'ask_person', { question: 'Which look?', options: ['Calm', 'Bold', 'Playful', 'Dark', 'Fifth'] })], 'tool_use'),
      reply([say('Never reached.')]),
    ]);
    await runTurn(turn, String);
    expect(call).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool', name: 'ask_person', ask: { question: 'Which look?', options: ['Calm', 'Bold', 'Playful', 'Dark'] } }),
    );
    expect(transcript(messages).at(-1)).toMatchObject({ kind: 'tool', ask: { question: 'Which look?' }, result: { ok: true } });
  });

  it('goes on when the question does not read, so the model can ask again', async () => {
    const { call, turn } = setup([reply([use('q1', 'ask_person', { options: ['A'] })], 'tool_use'), reply([say('Sorry.')])]);
    await runTurn(turn, String);
    expect(call).toHaveBeenCalledTimes(2);
  });
});

it('ends a turn with the History entry of what it wrote', async () => {
  const { events, turn } = setup([reply([say('Done.')])]);
  await runTurn({ ...turn, checkpoint: () => 'entry-1' }, String);
  expect(events.at(-1)).toMatchObject({ type: 'end', notice: undefined, checkpoint: 'entry-1' });
});
