// The agent's turn: the model is called with the conversation, the tools it asks for are
// run in order, their results go back, and so on until it ends its turn, the person stops
// it, or it reaches MAX_CALLS. The conversation is kept as the protocol's own messages, so
// it can be sent back exactly as it was (thinking blocks included).

import type Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, ChatItem, Question } from '../../shared/api';
import { REFERENCES_TAG, transcriptReferences } from './references';
import { MARKS_TAG, transcriptMarks } from './marks';
import type { Call, MessageParam } from './model';
import { type ToolContext, type ToolOutcome, askOf, runTool } from './tools';
import { NO_TOKENS, addTokens, messageTokens } from '../usage';

/** Model calls in one turn before the agent is stopped. */
export const MAX_CALLS = 40;

export interface Turn {
  messages: MessageParam[];
  /** The person's message: their words, and anything that goes with them (marks.ts). */
  content: string | Anthropic.Beta.BetaContentBlockParam[];
  call: Call;
  tools: ToolContext;
  emit(event: AgentEvent): void;
  /** Called after every step, to keep the conversation on disk. */
  save(messages: MessageParam[]): Promise<void>;
  signal: AbortSignal;
  /** The History entry of the files the turn wrote, if it wrote any. */
  checkpoint?(): string | undefined;
}

/** The question an ask_person call puts, or nothing for any other call or one that does not read. */
export function question(name: string, input: unknown): Question | undefined {
  if (name !== 'ask_person') return undefined;
  try {
    return askOf(input);
  } catch {
    return undefined;
  }
}

/** The moment a still was taken at, so the person can go to it. */
export function moment(name: string, input: unknown): number | undefined {
  const time = (input as { time?: unknown } | null)?.time;
  return name === 'still' && typeof time === 'number' ? time : undefined;
}

export function summary(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'list_files':
      return `Listing ${typeof i.path === 'string' ? i.path : 'the project'}`;
    case 'read_file':
      return `Reading ${String(i.path)}`;
    case 'write_file':
      return `Writing ${String(i.path)}`;
    case 'edit_file':
      return `Editing ${String(i.path)}`;
    case 'check':
      return 'Checking the film';
    case 'still':
      return `Looking at ${Number(i.time).toFixed(1)} s`;
    case 'search_motions':
      return `Searching motionhub for "${typeof i.words === 'string' ? i.words : ''}"`;
    case 'use_motion':
      return `Taking ${String(i.id)}`;
    case 'ask_person':
      return 'Asking you';
    default:
      return name;
  }
}

/** Runs one turn on `messages`, which it extends in place. Never throws: a failure ends the turn with a notice. */
export async function runTurn(turn: Turn, failure: (error: unknown) => string): Promise<{ ok: boolean }> {
  const { messages, emit, signal } = turn;
  const started = Date.now();
  let tokens = NO_TOKENS;
  let made = 0;
  messages.push({ role: 'user', content: turn.content });
  await turn.save(messages);
  let notice: { text: string; error: boolean } | undefined;
  try {
    for (let calls = 0; ; calls++) {
      if (calls === MAX_CALLS) {
        notice = { text: `Stopped after ${MAX_CALLS} model calls. Send a message to let it go on.`, error: false };
        break;
      }
      emit({ type: 'phase', phase: 'thinking' });
      const reply = await turn.call(messages, (text) => emit({ type: 'text', text }), signal);
      tokens = addTokens(tokens, messageTokens(reply.usage));
      made++;
      messages.push({ role: 'assistant', content: reply.content });
      await turn.save(messages);

      const uses = reply.content.filter((block) => block.type === 'tool_use');
      if (reply.stop_reason === 'refusal') {
        notice = { text: 'The model declined to go on with this.', error: true };
      } else if (reply.stop_reason === 'max_tokens') {
        notice = { text: 'The reply was cut off at its length limit.', error: true };
      }
      if (uses.length === 0 || notice) {
        // A tool call the model never finished is answered, so the conversation stays valid.
        if (uses.length) {
          messages.push({
            role: 'user',
            content: uses.map((use) => ({ type: 'tool_result' as const, tool_use_id: use.id, is_error: true, content: 'Not run.' })),
          });
          await turn.save(messages);
        }
        break;
      }

      const results: { id: string; outcome: ToolOutcome }[] = [];
      for (const use of uses) {
        if (signal.aborted) {
          results.push({ id: use.id, outcome: { ok: false, content: 'Stopped by the person.', text: 'Stopped.' } });
          continue;
        }
        emit({
          type: 'phase',
          phase:
            use.name === 'check'
              ? 'checking'
              : use.name === 'write_file' || use.name === 'edit_file' || use.name === 'use_motion'
                ? 'editing'
                : 'reviewing',
        });
        emit({
          type: 'tool',
          id: use.id,
          name: use.name,
          summary: summary(use.name, use.input),
          at: moment(use.name, use.input),
          ask: question(use.name, use.input),
        });
        const outcome = await runTool(use.name, use.input, turn.tools);
        emit({ type: 'tool-result', id: use.id, ok: outcome.ok, text: outcome.text, image: outcome.image });
        results.push({ id: use.id, outcome });
      }
      messages.push({
        role: 'user',
        content: results.map(({ id, outcome }) => ({
          type: 'tool_result' as const,
          tool_use_id: id,
          content: outcome.content,
          ...(outcome.ok ? {} : { is_error: true }),
        })),
      });
      await turn.save(messages);
      // A question ends the turn: the person's answer is their next message.
      if (signal.aborted || results.some(({ id, outcome }) => outcome.ok && uses.find((u) => u.id === id)?.name === 'ask_person')) break;
    }
  } catch (error) {
    notice = signal.aborted ? { text: 'Stopped.', error: false } : { text: failure(error), error: true };
  }
  if (signal.aborted && !notice) notice = { text: 'Stopped.', error: false };
  emit({ type: 'end', notice, checkpoint: turn.checkpoint?.(), usage: { ...tokens, calls: made, seconds: (Date.now() - started) / 1000 } });
  return { ok: !notice?.error && !signal.aborted };
}

/** The conversation as the assistant panel shows it: words, and the tools used between them. */
export function transcript(messages: MessageParam[]): ChatItem[] {
  const items: ChatItem[] = [];
  const tools = new Map<string, Extract<ChatItem, { kind: 'tool' }>>();
  for (const message of messages) {
    const blocks = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : (message.content ?? []);
    if (message.role === 'user' && !blocks.some((b) => b.type === 'tool_result')) {
      // The person's words, and how many places they marked: the rest of the message is for the agent.
      const text = blocks
        .flatMap((b) =>
          b.type === 'text' && !b.text.startsWith(MARKS_TAG) && !b.text.startsWith(REFERENCES_TAG) && !/^Mark \d+:$/.test(b.text)
            ? [b.text]
            : [],
        )
        .join('\n');
      const marks = transcriptMarks(blocks);
      const referenced = blocks.find((b) => b.type === 'text' && b.text.startsWith(REFERENCES_TAG));
      const references = referenced?.type === 'text' ? transcriptReferences(referenced.text) : {};
      if (text.trim() || marks.length || references.refs?.length) items.push({ kind: 'user', text, marks, ...references });
      continue;
    }
    for (const block of blocks) {
      if (block.type === 'text' && block.text.trim()) {
        items.push(message.role === 'user' ? { kind: 'user', text: block.text, marks: [] } : { kind: 'assistant', text: block.text });
      } else if (block.type === 'tool_use') {
        const item = {
          kind: 'tool' as const,
          id: block.id,
          name: block.name,
          summary: summary(block.name, block.input),
          at: moment(block.name, block.input),
          ask: question(block.name, block.input),
        };
        tools.set(block.id, item);
        items.push(item);
      } else if (block.type === 'tool_result') {
        const item = tools.get(block.tool_use_id);
        if (!item) continue;
        const content = typeof block.content === 'string' ? block.content : (block.content ?? []);
        const words = typeof content === 'string' ? content : content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n');
        const picture = typeof content === 'string' ? undefined : content.find((c) => c.type === 'image');
        const image =
          picture?.type === 'image' && picture.source.type === 'base64'
            ? `data:${picture.source.media_type};base64,${picture.source.data}`
            : undefined;
        item.result = { ok: !block.is_error, text: words, image };
      }
    }
  }
  return items;
}
