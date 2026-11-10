import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { testProvider } from '../test-connection';

let server: Server | undefined;
afterEach(() => server?.close());

async function serve(status: number, body: string): Promise<string> {
  server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(status, { 'content-type': status === 200 ? 'text/event-stream' : 'application/json' });
      response.end(body);
    });
  });
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
}

const provider = (baseUrl: string, key = 'sk-test-secret') =>
  ({ id: 'p', name: 'Local', protocol: 'openai', baseUrl, model: 'm', images: false, key }) as const;

describe('testProvider', () => {
  it('says the connection works and whether the model called the tool', async () => {
    const call = '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"ping","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}';
    const result = await testProvider(provider(await serve(200, `data: ${call}\n\ndata: [DONE]\n\n`)));
    expect(result).toMatchObject({ ok: true, calledTool: true });
    server?.close();
    const text = await testProvider(provider(await serve(200, 'data: {"choices":[{"delta":{"content":"pong"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')));
    expect(text).toMatchObject({ ok: true, calledTool: false });
  });

  it("reports the provider's refusal, and never the key", async () => {
    const result = await testProvider(provider(await serve(401, JSON.stringify({ error: { message: 'Invalid API key' } }))));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('sk-test-secret');
    if (!result.ok) expect(result.error).toMatch(/key/i);
  });

  it('reports a server that is not there', async () => {
    const result = await testProvider(provider('http://127.0.0.1:9/v1'));
    expect(result.ok).toBe(false);
  });
});
