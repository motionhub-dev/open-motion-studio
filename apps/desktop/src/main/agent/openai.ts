// The OpenAI Chat Completions protocol, for the servers that speak only it (OpenAI,
// OpenRouter, DeepSeek, Gemini's compatible endpoint, Ollama, LM Studio). The agent keeps
// its conversation in the Messages shape (model.ts); this module translates a call into a
// chat completion and its streamed answer back into a message, so the loop and the saved
// conversation never know which protocol a provider speaks.

import type Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '../providers';
import type { Call, Message, MessageParam } from './model';

type Tool = Anthropic.Beta.BetaTool;

/** A provider's answer that is not a success: its status and its own words. */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type ChatPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ChatPart[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/** The conversation as chat messages. A tool's picture follows the tool messages as the person's, where the model reads images. */
export function toChat(system: string, messages: MessageParam[], images: boolean): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    const blocks = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : (message.content ?? []);
    if (message.role === 'assistant') {
      const text = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      const calls = blocks.flatMap((b) =>
        b.type === 'tool_use'
          ? [{ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }]
          : [],
      );
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    const parts: ChatPart[] = [];
    const pictures: ChatPart[] = [];
    for (const block of blocks) {
      if (block.type === 'text') parts.push({ type: 'text', text: block.text });
      else if (block.type === 'tool_result') {
        const content = typeof block.content === 'string' ? [{ type: 'text' as const, text: block.content }] : (block.content ?? []);
        const words = content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n');
        out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: (block.is_error ? 'Error: ' : '') + (words || '(no text)') });
        if (images) {
          for (const c of content) {
            if (c.type === 'image' && c.source.type === 'base64') {
              pictures.push({ type: 'image_url', image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } });
            }
          }
        }
      }
    }
    if (pictures.length) out.push({ role: 'user', content: [{ type: 'text', text: 'The picture the tool returned:' }, ...pictures] });
    if (parts.length) out.push({ role: 'user', content: parts.length === 1 && parts[0]!.type === 'text' ? parts[0]!.text : parts });
  }
  return out;
}

const STOPS: Record<string, Message['stop_reason']> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  length: 'max_tokens',
  content_filter: 'refusal',
};

interface Chunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string };
}

/** Reads a chat completion's event stream into a message in the Messages shape. */
export async function readStream(body: ReadableStream<Uint8Array>, model: string, onText: (text: string) => void): Promise<Message> {
  let text = '';
  let finish: string | null = null;
  const usage = { input_tokens: 0, output_tokens: 0 };
  const calls = new Map<number, { id: string; name: string; args: string }>();
  const decoder = new TextDecoder();
  let pending = '';

  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data) as Chunk;
    if (chunk.error) throw new ProviderError(500, chunk.error.message ?? 'The provider reported an error mid-answer.');
    if (chunk.usage) {
      usage.input_tokens = chunk.usage.prompt_tokens ?? usage.input_tokens;
      usage.output_tokens = chunk.usage.completion_tokens ?? usage.output_tokens;
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta ?? {};
      if (delta.content) {
        text += delta.content;
        onText(delta.content);
      }
      for (const [i, call] of (delta.tool_calls ?? []).entries()) {
        const index = call.index ?? i;
        const known = calls.get(index) ?? { id: '', name: '', args: '' };
        if (call.id) known.id = call.id;
        if (call.function?.name) known.name += call.function.name;
        if (call.function?.arguments) known.args += call.function.arguments;
        calls.set(index, known);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  };

  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    lines.forEach(take);
  }
  take(pending);

  const content: Message['content'] = [];
  if (text) content.push({ type: 'text', text, citations: null } as Message['content'][number]);
  for (const [index, call] of [...calls].sort(([a], [b]) => a - b)) {
    let input: unknown;
    try {
      input = call.args.trim() ? JSON.parse(call.args) : {};
    } catch {
      input = { invalid_arguments: call.args };
    }
    content.push({ type: 'tool_use', id: call.id || `call_${index}`, name: call.name, input } as Message['content'][number]);
  }
  // Some servers end a turn with tool calls as `stop`; the calls decide.
  const stop = calls.size && finish !== 'length' ? 'tool_use' : (STOPS[finish ?? 'stop'] ?? 'end_turn');
  return { id: 'chat', type: 'message', role: 'assistant', model, content, stop_reason: stop, usage } as unknown as Message;
}

export function chatCaller(provider: Provider, system: string, tools: Tool[]): Call {
  const functions = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  return async (messages, onText, signal) => {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        ...(provider.key ? { authorization: `Bearer ${provider.key}` } : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages: toChat(system, messages, provider.images),
        tools: functions,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    if (!response.ok || !response.body) {
      const detail = (await response.text().catch(() => '')).slice(0, 500);
      let reason = detail;
      try {
        reason = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? detail;
      } catch {
        // not JSON: the text as it came
      }
      throw new ProviderError(response.status, reason || response.statusText);
    }
    return readStream(response.body, provider.model, onText);
  };
}
