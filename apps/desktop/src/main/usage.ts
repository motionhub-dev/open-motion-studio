// What each turn of an agent took, on one footing for every agent, and the project's log of it: one JSON line a turn
// appended to .motion-studio/usage.jsonl (ADR 0009), never rewritten. Each agent counts its tokens its own way; the
// readers here put them as the Messages API does, the input apart from what the prompt cache read or wrote.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentKind, Tokens, TurnUsage, UsageTotals } from '../shared/api';
import { STATE_DIR } from './project';

export const NO_TOKENS: Tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };

export const addTokens = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
});

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** A Messages API reply's `usage` (the built-in agent, and the Chat Completions reply put in its shape). */
export function messageTokens(usage: unknown): Tokens {
  const u = (usage ?? {}) as Record<string, unknown>;
  return {
    input: count(u.input_tokens),
    cacheRead: count(u.cache_read_input_tokens),
    cacheWrite: count(u.cache_creation_input_tokens),
    output: count(u.output_tokens),
    reasoning: count(u.reasoning_tokens),
  };
}

/** A Chat Completions `usage`, whose prompt tokens include the cached ones and completion tokens the reasoning. */
export function chatTokens(usage: unknown): Tokens {
  const u = (usage ?? {}) as { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown }; completion_tokens_details?: { reasoning_tokens?: unknown } };
  const cached = count(u.prompt_tokens_details?.cached_tokens);
  return {
    input: Math.max(0, count(u.prompt_tokens) - cached),
    cacheRead: cached,
    cacheWrite: 0,
    output: count(u.completion_tokens),
    reasoning: count(u.completion_tokens_details?.reasoning_tokens),
  };
}

/** One of Codex's `thread/tokenUsage/updated` breakdowns: input includes the cached input and cache writes. */
export function codexTokens(breakdown: unknown): Tokens {
  const b = (breakdown ?? {}) as Record<string, unknown>;
  const cacheRead = count(b.cachedInputTokens);
  const cacheWrite = count(b.cacheWriteInputTokens);
  return {
    input: Math.max(0, count(b.inputTokens) - cacheRead - cacheWrite),
    cacheRead,
    cacheWrite,
    output: count(b.outputTokens),
    reasoning: count(b.reasoningOutputTokens),
  };
}

/** What an outside agent reported a turn took, for the Studio to time and log. */
export interface Spent {
  tokens: Tokens;
  calls: number;
  model?: string;
  costUsd?: number;
}

/** Two accounts of one turn as one (a Claude Code turn that a message sent mid-turn ran on in). */
export const addSpent = (a: Spent, b: Spent): Spent => ({
  tokens: addTokens(a.tokens, b.tokens),
  calls: a.calls + b.calls,
  ...((b.model ?? a.model) ? { model: b.model ?? a.model } : {}),
  ...(a.costUsd !== undefined || b.costUsd !== undefined ? { costUsd: (a.costUsd ?? 0) + (b.costUsd ?? 0) } : {}),
});

type ModelUse = { inputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; outputTokens?: number; thinkingTokens?: number };

/**
 * A Claude Code `result`: its tokens, its model (the one that wrote most), and its cost in dollars where it says. Its
 * `usage` is the turn's, but zero on a turn that ended in an error (a cap reached, Claude Code 2.1); then the tokens
 * are its models' since the last result (`model_usage_since_last_result`; `modelUsage` is the session's).
 */
export function claudeResult(event: Record<string, unknown>): Spent {
  const since = event.model_usage_since_last_result as Record<string, ModelUse> | undefined;
  const models = Object.entries(since ?? ((event.modelUsage ?? {}) as Record<string, ModelUse>));
  const model = models.sort(([, a], [, b]) => count(b.outputTokens) - count(a.outputTokens))[0]?.[0];
  const reported = messageTokens(event.usage);
  const tokens =
    since && Object.values(reported).every((n) => n === 0)
      ? Object.values(since).reduce<Tokens>(
          (sum, m) =>
            addTokens(sum, {
              input: count(m.inputTokens),
              cacheRead: count(m.cacheReadInputTokens),
              cacheWrite: count(m.cacheCreationInputTokens),
              output: count(m.outputTokens),
              reasoning: count(m.thinkingTokens),
            }),
          NO_TOKENS,
        )
      : reported;
  return {
    tokens,
    ...(model ? { model } : {}),
    ...(typeof event.total_cost_usd === 'number' ? { costUsd: event.total_cost_usd } : {}),
    calls: count(event.num_turns),
  };
}

/** One line of a project's usage log: a turn, when it ended, which agent ran it, how it ended and what it took. */
export interface UsageLine extends TurnUsage {
  at: string;
  agent: AgentKind;
  outcome: 'done' | 'failed' | 'stopped';
  tools: number;
  /** In dollars, only where the agent reported it (Claude Code). */
  costUsd?: number;
  checkpoint?: string;
}

export const usageFile = (dir: string): string => join(dir, STATE_DIR, 'usage.jsonl');

/** Adds a turn to the project's log. */
export async function recordTurn(dir: string, line: UsageLine): Promise<void> {
  await mkdir(join(dir, STATE_DIR), { recursive: true });
  await appendFile(usageFile(dir), `${JSON.stringify(line)}\n`);
}

/** The project's turns, from its log; a line that does not read (a write cut short) is left out and said. */
export async function readTurns(dir: string): Promise<UsageLine[]> {
  let text: string;
  try {
    text = await readFile(usageFile(dir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const lines: UsageLine[] = [];
  for (const [n, raw] of text.split('\n').entries()) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw) as UsageLine);
    } catch {
      console.warn(`Line ${n + 1} of ${usageFile(dir)} does not read; it is left out of the totals.`);
    }
  }
  return lines;
}

/** The project's turns added up. */
export function totals(lines: UsageLine[]): UsageTotals {
  return lines.reduce<UsageTotals>(
    (sum, line) => ({ ...addTokens(sum, { ...NO_TOKENS, ...line }), turns: sum.turns + 1, seconds: sum.seconds + count(line.seconds) }),
    { ...NO_TOKENS, turns: 0, seconds: 0 },
  );
}
