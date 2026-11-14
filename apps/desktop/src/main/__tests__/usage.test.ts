import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UsageLine, chatTokens, claudeResult, codexTokens, messageTokens, readTurns, recordTurn, totals, usageFile } from '../usage';

vi.mock('electron', () => ({}));

describe('tokens on one footing', () => {
  it('reads the Messages API as it is: input apart from the cache', () => {
    expect(messageTokens({ input_tokens: 4, cache_read_input_tokens: 6531, cache_creation_input_tokens: 3426, output_tokens: 97 })).toEqual({
      input: 4,
      cacheRead: 6531,
      cacheWrite: 3426,
      output: 97,
      reasoning: 0,
    });
    expect(messageTokens(undefined)).toEqual({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 });
  });

  it('takes the cached part out of a Chat Completions prompt', () => {
    expect(
      chatTokens({ prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens_details: { reasoning_tokens: 120 } }),
    ).toEqual({ input: 200, cacheRead: 1000, cacheWrite: 0, output: 300, reasoning: 120 });
  });

  it('takes the cached input and cache writes out of a Codex call’s input', () => {
    expect(codexTokens({ inputTokens: 16866, cachedInputTokens: 16640, cacheWriteInputTokens: 0, outputTokens: 31, reasoningOutputTokens: 6 })).toEqual({
      input: 226,
      cacheRead: 16640,
      cacheWrite: 0,
      output: 31,
      reasoning: 6,
    });
  });

  it('reads a Claude Code result: its tokens, the model that wrote most, its cost and calls', () => {
    expect(
      claudeResult({
        type: 'result',
        num_turns: 3,
        total_cost_usd: 0.0008,
        usage: { input_tokens: 4, cache_read_input_tokens: 6531, cache_creation_input_tokens: 3426, output_tokens: 97 },
        modelUsage: { 'claude-haiku-5-5': { outputTokens: 12 }, 'claude-sonnet-5-5': { outputTokens: 85 } },
      }),
    ).toEqual({ tokens: { input: 4, cacheRead: 6531, cacheWrite: 3426, output: 97, reasoning: 0 }, calls: 3, model: 'claude-sonnet-5-5', costUsd: 0.0008 });
  });

  it('reads a Claude Code turn that ended in an error from its models since the last result, its usage being zero', () => {
    // As Claude Code 2.1 reported a turn stopped at its cap.
    const zero = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 };
    const since = { 'claude-haiku-5-5': { inputTokens: 2, outputTokens: 147, cacheReadInputTokens: 1670, cacheCreationInputTokens: 3335, thinkingTokens: 0 } };
    expect(
      claudeResult({
        type: 'result',
        is_error: true,
        num_turns: 1,
        usage: zero,
        modelUsage: { 'claude-haiku-5-5': { inputTokens: 900, outputTokens: 9000 } },
        model_usage_since_last_result: since,
      }),
    ).toEqual({ tokens: { input: 2, cacheRead: 1670, cacheWrite: 3335, output: 147, reasoning: 0 }, calls: 1, model: 'claude-haiku-5-5' });
  });
});

describe("a project's usage log", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'oms-usage-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const line = (over: Partial<UsageLine>): UsageLine => ({
    at: '2026-11-14T06:00:00.000Z',
    agent: 'claude',
    outcome: 'done',
    seconds: 72,
    calls: 4,
    input: 1000,
    cacheRead: 20000,
    cacheWrite: 500,
    output: 800,
    reasoning: 0,
    tools: 9,
    ...over,
  });

  it('keeps one line a turn in .motion-studio/usage.jsonl, appended', async () => {
    expect(usageFile(dir)).toBe(join(dir, '.motion-studio', 'usage.jsonl'));
    await recordTurn(dir, line({ costUsd: 0.21, checkpoint: 'entry-1', model: 'claude-sonnet-5-5' }));
    await recordTurn(dir, line({ agent: 'codex', outcome: 'stopped' }));
    const text = await readFile(usageFile(dir), 'utf8');
    expect(text.split('\n')).toHaveLength(3);
    expect(JSON.parse(text.split('\n')[0]!)).toMatchObject({ agent: 'claude', costUsd: 0.21, checkpoint: 'entry-1' });
    expect((await readTurns(dir)).map((l) => l.outcome)).toEqual(['done', 'stopped']);
  });

  it('adds the turns up, leaving out a line cut short', async () => {
    expect(totals(await readTurns(dir))).toEqual({ turns: 0, seconds: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 });
    await recordTurn(dir, line({}));
    await appendFile(usageFile(dir), '{"at":"2026-11-14T06:0');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await appendFile(usageFile(dir), '\n');
    await recordTurn(dir, line({ seconds: 8, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, reasoning: 2 }));
    expect(totals(await readTurns(dir))).toEqual({ turns: 2, seconds: 80, input: 1010, cacheRead: 20000, cacheWrite: 500, output: 805, reasoning: 2 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
