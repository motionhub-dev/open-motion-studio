// The person's own Claude Code, through `claude -p` with stream-json in and out (ADR 0008): one process per open
// project, started in its folder, each message a JSON line on its stdin and each event a JSON line on its stdout,
// until a `result` ends the turn. It runs with the Studio's settings alone: no setting sources (so none of the
// person's hooks, settings or project instructions), the Studio's MCP server as its only one, the film's skill
// appended to its system prompt, and a fixed set of tools: reading, searching, editing and writing files, and the
// Studio's. It has no shell or web tool, since a headless Claude Code cannot stop to ask (ADR 0008). Stop ends the
// process; the next message resumes the session. Nothing of the person's sign-in passes through here.

import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, AgentModel, AgentSettings } from '../../shared/api';
import { CLAUDE_EFFORTS, claudeEnv } from './harness';
import { moment, question, summary } from './loop';
import { NO_TOKENS, type Spent, addSpent, claudeResult } from '../usage';

/** The name the Studio's MCP server has in a Claude Code session, and so the prefix of its tools there. */
export const CLAUDE_STUDIO_SERVER = 'open_motion_studio';
const STUDIO_PREFIX = `mcp__${CLAUDE_STUDIO_SERVER}__`;

/** Claude Code's own tools a session gets: files in the project, read and written; no shell, no web. */
export const CLAUDE_TOOLS = ['Read', 'Glob', 'Grep', 'Edit', 'Write'];

type Block = Anthropic.Beta.BetaContentBlockParam;
type Notice = { text: string; error: boolean };
type Event = { type: string; subtype?: string; [key: string]: unknown };

/** Claude Code's aliases for the latest model of each family; a full model name works as well. */
export const CLAUDE_MODELS: AgentModel[] = [
  { id: 'fable', name: 'Fable', efforts: CLAUDE_EFFORTS },
  { id: 'opus', name: 'Opus', efforts: CLAUDE_EFFORTS },
  { id: 'sonnet', name: 'Sonnet', efforts: CLAUDE_EFFORTS },
  { id: 'haiku', name: 'Haiku', efforts: CLAUDE_EFFORTS },
];

/**
 * The arguments a session starts with: the Studio's settings alone, how the person chose to run it (each left out
 * when it is the CLI's own default), and a new session or the one to go on with.
 */
export function claudeArgs(skill: string, studioUrl: string, session: { id: string; resume: boolean }, settings: AgentSettings['claude']): string[] {
  return [
    ...(settings.model ? ['--model', settings.model] : []),
    ...(settings.effort ? ['--effort', settings.effort] : []),
    ...(settings.fallbackModel ? ['--fallback-model', settings.fallbackModel] : []),
    ...(settings.budgetUsd !== null ? ['--max-budget-usd', String(settings.budgetUsd)] : []),
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    // Each message is echoed (isReplay) when Claude Code takes it in, which says whether one sent mid-turn joined it.
    '--replay-user-messages',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify({ mcpServers: { [CLAUDE_STUDIO_SERVER]: { type: 'http', url: studioUrl } } }),
    '--disable-slash-commands',
    '--tools',
    CLAUDE_TOOLS.join(','),
    '--allowedTools',
    [...CLAUDE_TOOLS, `mcp__${CLAUDE_STUDIO_SERVER}`].join(','),
    '--permission-mode',
    'acceptEdits',
    '--append-system-prompt',
    skill,
    ...(session.resume ? ['--resume', session.id] : ['--session-id', session.id]),
  ];
}

/**
 * A running `claude -p` session: its turns, one at a time, as the panel's events. A message sent while a turn runs
 * (steer) goes to Claude Code at once: taken in before the turn's end, it joins that turn; taken in after, Claude Code
 * runs it as a turn of its own, which the Studio counts as the rest of this one. So a turn ends at the first `result`
 * by which every message written has been echoed back (`isReplay`), not merely at the first `result`.
 */
export class ClaudeSession {
  private child: ChildProcess;
  private listener: ((event: Event) => void) | null = null;
  private stderr = '';
  /** Messages written to Claude Code in the running turn, and how many it has echoed as taken in. */
  private written = 0;
  private takenIn = 0;
  readonly ended: Promise<void>;

  constructor(bin: string, dir: string, args: string[]) {
    this.child = spawn(bin, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: claudeEnv() });
    let buffer = '';
    this.child.stdout!.setEncoding('utf8');
    this.child.stdout!.on('data', (chunk: string) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        try {
          this.listener?.(JSON.parse(line) as Event);
        } catch {
          // A line that is not JSON is Claude Code talking to a terminal; it is not part of the protocol.
        }
      }
    });
    this.child.stderr!.on('data', (chunk: Buffer) => (this.stderr = (this.stderr + String(chunk)).slice(-2000)));
    this.ended = new Promise((done) => this.child.on('close', () => done()));
    this.child.on('error', () => undefined);
  }

  /** The last line Claude Code wrote to stderr, for an error that needs it. */
  lastWords(): string {
    return (this.stderr.trim().split('\n').pop() ?? '').slice(0, 300);
  }

  /** Runs one turn: the person's message in, its events out through `emit`, until the turn's result. Never throws. */
  async turn(content: Block[], emit: (event: AgentEvent) => void, signal: AbortSignal): Promise<{ ok: boolean; notice?: Notice; spent: Spent }> {
    const reading: ClaudeReading = { said: false, tools: new Map() };
    let finished!: (notice: Notice | undefined) => void;
    const over = new Promise<Notice | undefined>((done) => (finished = done));
    this.written = 0;
    this.takenIn = 0;
    // The last error a result reported, kept when a message sent mid-turn runs on after it.
    let failed: Notice | undefined;
    // What the turn took, from each of its results (more than one when a message sent mid-turn ran after one).
    let spent: Spent = { tokens: NO_TOKENS, calls: 0 };
    this.listener = (event) => {
      if (event.type === 'user' && event.isReplay === true) this.takenIn++;
      for (const out of translateClaude(event, reading)) emit(out);
      if (event.type === 'result') {
        failed = resultNotice(event) ?? failed;
        spent = addSpent(spent, claudeResult(event));
        if (this.takenIn >= this.written) {
          // No more messages join this turn: one sent from here on waits for the next.
          this.listener = null;
          finished(failed);
        }
      }
    };
    const stop = () => this.close();
    signal.addEventListener('abort', stop);
    emit({ type: 'phase', phase: 'thinking' });
    let notice: Notice | undefined;
    try {
      this.write(content);
      notice = await Promise.race([
        over,
        this.ended.then(() =>
          signal.aborted ? { text: 'Stopped.', error: false } : { text: `Claude Code stopped during the turn. ${this.lastWords()}`.trim(), error: true },
        ),
      ]);
    } catch (error) {
      notice = { text: error instanceof Error ? error.message : String(error), error: true };
    } finally {
      this.listener = null;
      signal.removeEventListener('abort', stop);
    }
    return { ok: !notice?.error && !signal.aborted, notice, spent };
  }

  /** Sends the person's message into the running turn; false when no turn runs, so the message waits for the next. */
  steer(content: Block[]): boolean {
    if (!this.listener) return false;
    this.write(content);
    return true;
  }

  private write(content: Block[]): void {
    this.written++;
    this.child.stdin!.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`);
  }

  close(): void {
    this.child.kill();
  }
}

/** A new session id for a project's first message to Claude Code. */
export const newClaudeSession = () => randomUUID();

/** Where a turn's translation is: whether text has been said, and each tool call's Studio name by its id. */
export interface ClaudeReading {
  said: boolean;
  tools: Map<string, string>;
}

/** A Claude Code tool call as the panel names it, so it folds and reads as the built-in agent's. */
function asStudioTool(name: string, input: Record<string, unknown>): { name: string; summary: string } {
  if (name.startsWith(STUDIO_PREFIX)) {
    const tool = name.slice(STUDIO_PREFIX.length);
    return { name: tool, summary: summary(tool, input) };
  }
  const path = typeof input.file_path === 'string' ? input.file_path : typeof input.path === 'string' ? input.path : '';
  switch (name) {
    case 'Read':
      return { name: 'read_file', summary: `Reading ${path || 'a file'}` };
    case 'Edit':
      return { name: 'edit_file', summary: `Editing ${path || 'a file'}` };
    case 'Write':
      return { name: 'write_file', summary: `Writing ${path || 'a file'}` };
    case 'Glob':
    case 'Grep':
      return { name: 'list_files', summary: `Searching for ${String(input.pattern ?? '')}`.trim() };
    default:
      return { name, summary: name };
  }
}

/** What one of Claude Code's stream-json events means to the panel. */
export function translateClaude(event: Event, reading: ClaudeReading): AgentEvent[] {
  if (event.type === 'stream_event') {
    const inner = event.event as { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string } } | undefined;
    if (inner?.type === 'content_block_start' && inner.content_block?.type === 'text' && reading.said) return [{ type: 'text', text: '\n\n' }];
    if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && inner.delta.text) {
      reading.said = true;
      return [{ type: 'text', text: inner.delta.text }];
    }
    if (inner?.type === 'content_block_start' && inner.content_block?.type === 'thinking') return [{ type: 'phase', phase: 'thinking' }];
    return [];
  }
  const blocks = ((event.message as { content?: unknown } | undefined)?.content ?? []) as { type: string; [key: string]: unknown }[];
  if (event.type === 'assistant' && Array.isArray(blocks)) {
    return blocks.flatMap((block): AgentEvent[] => {
      if (block.type !== 'tool_use') return [];
      const id = String(block.id);
      const input = (block.input ?? {}) as Record<string, unknown>;
      const tool = asStudioTool(String(block.name), input);
      reading.tools.set(id, tool.name);
      const ask = question(tool.name, input);
      return [
        {
          type: 'phase',
          phase: tool.name === 'check' ? 'checking' : tool.name === 'edit_file' || tool.name === 'write_file' ? 'editing' : 'reviewing',
        },
        { type: 'tool', id, name: tool.name, summary: tool.summary, at: moment(tool.name, input), ...(ask ? { ask } : {}) },
      ];
    });
  }
  if (event.type === 'user' && Array.isArray(blocks)) {
    return blocks.flatMap((block): AgentEvent[] => {
      if (block.type !== 'tool_result' || !reading.tools.has(String(block.tool_use_id))) return [];
      const content = block.content;
      const parts = (typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []) as {
        type: string;
        text?: string;
        source?: { type?: string; media_type?: string; data?: string };
      }[];
      const text = parts.flatMap((p) => (p.type === 'text' && p.text ? [p.text] : [])).join('\n');
      const picture = parts.find((p) => p.type === 'image' && p.source?.type === 'base64');
      return [
        {
          type: 'tool-result',
          id: String(block.tool_use_id),
          ok: block.is_error !== true,
          text: text.slice(0, 2000),
          ...(picture ? { image: `data:${picture.source!.media_type};base64,${picture.source!.data}` } : {}),
        },
      ];
    });
  }
  return [];
}

/** How a turn ended, from its `result`: nothing to say when it went well, else Claude Code's own words. */
export function resultNotice(event: Event): Notice | undefined {
  if (event.is_error !== true) return undefined;
  const errors = Array.isArray(event.errors) ? event.errors.filter((e): e is string => typeof e === 'string') : [];
  const said = typeof event.result === 'string' && event.result ? event.result : errors.join(' ');
  if (event.subtype === 'error_max_budget_usd') {
    return { text: `The turn stopped at its cap${said ? `: ${said}` : ''}. Raise or remove the cap per turn in Models to go on.`, error: true };
  }
  if (/not logged in/i.test(said)) return { text: 'Claude Code is not signed in. Sign in with `claude auth login`, then send again.', error: true };
  return { text: said || 'Claude Code could not finish the turn.', error: true };
}
