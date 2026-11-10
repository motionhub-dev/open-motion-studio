// One call to the model, its answer streamed. The conversation is kept in the Anthropic
// Messages shape whatever the provider speaks: a Messages server is called through the
// official SDK, and a Chat Completions server through openai.ts, which translates. Anthropic's
// own API gets what only it understands: server-side refusal fallbacks, an effort setting and
// automatic prompt caching of the conversation.

import Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '../providers';
import { ProviderError, chatCaller } from './openai';

export type Message = Anthropic.Beta.BetaMessage;
export type MessageParam = Anthropic.Beta.BetaMessageParam;

/** Calls the model with the conversation; `onText` hears the reply as it is written. */
export type Call = (messages: MessageParam[], onText: (text: string) => void, signal: AbortSignal) => Promise<Message>;

/** Room for a whole film file in one tool call. Streaming keeps a large reply clear of HTTP timeouts. */
const MAX_TOKENS = 64_000;

export function caller(provider: Provider, system: string, tools: Anthropic.Beta.BetaTool[]): Call {
  return provider.protocol === 'openai' ? chatCaller(provider, system, tools) : messagesCaller(provider, system, tools);
}

function messagesCaller(provider: Provider, system: string, tools: Anthropic.Beta.BetaTool[]): Call {
  // Only the provider's own key: nothing the SDK would read from the environment or a profile.
  const client = new Anthropic({ apiKey: provider.key, authToken: null, baseURL: provider.baseUrl, maxRetries: 2 });
  const anthropic = new URL(provider.baseUrl).hostname === 'api.anthropic.com';
  return async (messages, onText, signal) => {
    const stream = client.beta.messages.stream(
      {
        model: provider.model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
        ...(anthropic && {
          // A turn a model declines for safety goes on, on the model Anthropic routes it to.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Agentic work that writes and checks code repays more effort than the default.
          output_config: { effort: 'high' },
          // Caches the conversation so far, so each tool round trip reads it from the cache.
          cache_control: { type: 'ephemeral' },
        }),
      },
      { signal },
    );
    stream.on('text', onText);
    return stream.finalMessage();
  };
}

/** What the person is told when a call fails: the provider's own reason, never the key. */
export function failure(error: unknown, provider: string): string {
  if (error instanceof ProviderError) {
    if (error.status === 401) return `${provider} refused the key. Check it in Settings.`;
    if (error.status === 403) return `${provider} does not allow this key to use the model.`;
    if (error.status === 404) return `${provider} has no such model, or the address is wrong.`;
    if (error.status === 429) return `${provider} is limiting requests. Try again in a moment.`;
    return `${provider} answered ${error.status}: ${error.message}`;
  }
  if (error instanceof TypeError && error.message === 'fetch failed') return `${provider} could not be reached.`;
  if (error instanceof Anthropic.AuthenticationError) return `${provider} refused the key. Check it in Settings.`;
  if (error instanceof Anthropic.PermissionDeniedError) return `${provider} does not allow this key to use the model.`;
  if (error instanceof Anthropic.NotFoundError) return `${provider} has no such model, or the address is wrong.`;
  if (error instanceof Anthropic.RateLimitError) return `${provider} is limiting requests. Try again in a moment.`;
  if (error instanceof Anthropic.APIConnectionError) return `${provider} could not be reached: ${error.message}`;
  if (error instanceof Anthropic.APIError) return `${provider} answered ${error.status ?? 'with an error'}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
