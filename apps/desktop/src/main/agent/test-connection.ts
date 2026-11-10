// A connection test: one call to a provider as the person set it up, asking the model to call
// a tool, which is what the agent needs of it. It says whether the server answered, how fast,
// and whether the model called the tool; a failure is the provider's reason, never its key.

import type { ProviderTest } from '../../shared/api';
import type { Provider } from '../providers';
import { caller, failure } from './model';

/** How long a test waits before it calls the provider unreachable. */
const TEST_MS = 45_000;

const PING = { name: 'ping', description: 'Answers a connection test.', input_schema: { type: 'object' as const, properties: {} } };

export async function testProvider(provider: Provider): Promise<ProviderTest> {
  const started = Date.now();
  try {
    const call = caller(provider, 'You are checking a connection. Call the ping tool once, and say nothing else.', [PING]);
    const reply = await call([{ role: 'user', content: 'Call the ping tool.' }], () => {}, AbortSignal.timeout(TEST_MS));
    return { ok: true, ms: Date.now() - started, calledTool: reply.content.some((block) => block.type === 'tool_use') };
  } catch (error) {
    return { ok: false, error: failure(error, provider.name) };
  }
}
