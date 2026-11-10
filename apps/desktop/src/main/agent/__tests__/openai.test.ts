import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageParam } from '../model';
import { ProviderError, chatCaller, readStream, toChat } from '../openai';

vi.mock('electron', () => ({}));

const conversation: MessageParam[] = [
  { role: 'user', content: 'A title card' },
  {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'hidden', signature: 's' },
      { type: 'text', text: 'Writing it.' },
      { type: 'tool_use', id: 'call_1', name: 'write_file', input: { path: 'film.tsx', content: 'x' } },
      { type: 'tool_use', id: 'call_2', name: 'still', input: { time: 1 } },
    ],
  },
  {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'call_1', content: 'Wrote film.tsx.' },
      {
        type: 'tool_result',
        tool_use_id: 'call_2',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
          { type: 'text', text: 'The frame at 1.00 s.' },
        ],
      },
    ],
  },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_3', is_error: true, content: 'Not run.' }] },
];

describe('toChat', () => {
  it('turns the conversation into chat messages, a tool call per tool use and a tool message per result', () => {
    const chat = toChat('Be brief.', conversation, true);
    expect(chat).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'A title card' },
      {
        role: 'assistant',
        content: 'Writing it.',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'write_file', arguments: '{"path":"film.tsx","content":"x"}' } },
          { id: 'call_2', type: 'function', function: { name: 'still', arguments: '{"time":1}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'Wrote film.tsx.' },
      { role: 'tool', tool_call_id: 'call_2', content: 'The frame at 1.00 s.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'The picture the tool returned:' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_3', content: 'Error: Not run.' },
    ]);
  });

  it('sends no picture to a model that does not read images', () => {
    const chat = toChat('', conversation, false);
    expect(JSON.stringify(chat)).not.toContain('image_url');
    expect(chat.filter((m) => m.role === 'tool')).toHaveLength(3);
  });
});

/** A stream of server-sent events, split at awkward places as a network would. */
function stream(events: unknown[], split = 7): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
      controller.close();
    },
  });
}

describe('readStream', () => {
  it('assembles text and tool calls whose arguments arrive in pieces', async () => {
    const heard: string[] = [];
    const message = await readStream(
      stream([
        { choices: [{ delta: { content: 'Let me ' } }] },
        { choices: [{ delta: { content: 'look.' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'still', arguments: '{"ti' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', function: { name: 'check', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'me": 2.5}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } },
        '[DONE]',
      ]),
      'm',
      (t) => heard.push(t),
    );
    expect(heard.join('')).toBe('Let me look.');
    expect(message.stop_reason).toBe('tool_use');
    expect(message.usage).toMatchObject({ input_tokens: 120, output_tokens: 30 });
    expect(message.content).toEqual([
      { type: 'text', text: 'Let me look.', citations: null },
      { type: 'tool_use', id: 'a', name: 'still', input: { time: 2.5 } },
      { type: 'tool_use', id: 'b', name: 'check', input: {} },
    ]);
  });

  it('takes the tool calls over a server that ends the turn with "stop"', async () => {
    const message = await readStream(
      stream([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'check', arguments: '{}' } }] }, finish_reason: 'stop' }] }]),
      'm',
      () => {},
    );
    expect(message.stop_reason).toBe('tool_use');
  });

  it('maps a cut-off answer and a filtered one, and keeps arguments that are not JSON for the tool to refuse', async () => {
    const cut = await readStream(
      stream([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'write_file', arguments: '{"path": "fi' } }] }, finish_reason: 'length' }] }]),
      'm',
      () => {},
    );
    expect(cut.stop_reason).toBe('max_tokens');
    expect(cut.content[0]).toMatchObject({ type: 'tool_use', input: { invalid_arguments: '{"path": "fi' } });
    const filtered = await readStream(stream([{ choices: [{ delta: {}, finish_reason: 'content_filter' }] }]), 'm', () => {});
    expect(filtered.stop_reason).toBe('refusal');
  });

  it('fails on an error the server sends mid-answer', async () => {
    await expect(readStream(stream([{ error: { message: 'overloaded' } }]), 'm', () => {})).rejects.toThrow('overloaded');
  });
});

describe('chatCaller', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
    server = createServer(handler);
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
  }

  const provider = (baseUrl: string, key: string) =>
    ({ id: 'p', name: 'P', protocol: 'openai', baseUrl, model: 'deepseek-chat', images: false, key }) as const;

  it('posts the chat with the tools as functions and the key as a bearer, and reads the answer', async () => {
    let seen: { url?: string; auth?: string; body?: Record<string, unknown> } = {};
    const base = await serve((request, response) => {
      let body = '';
      request.on('data', (d) => (body += d));
      request.on('end', () => {
        seen = { url: request.url, auth: request.headers.authorization, body: JSON.parse(body) };
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: {"choices":[{"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      });
    });
    const call = chatCaller(provider(base, 'sk-x'), 'System.', [
      { name: 'check', description: 'Checks.', input_schema: { type: 'object', properties: {} } },
    ]);
    const message = await call([{ role: 'user', content: 'Hi' }], () => {}, new AbortController().signal);
    expect(message.content).toEqual([{ type: 'text', text: 'Done.', citations: null }]);
    expect(seen.url).toBe('/v1/chat/completions');
    expect(seen.auth).toBe('Bearer sk-x');
    expect(seen.body).toMatchObject({
      model: 'deepseek-chat',
      stream: true,
      tools: [{ type: 'function', function: { name: 'check', description: 'Checks.', parameters: { type: 'object', properties: {} } } }],
    });
  });

  it('sends no authorization to a server that needs no key, and reports a refusal with its status', async () => {
    let auth: string | undefined = 'unset';
    const base = await serve((request, response) => {
      auth = request.headers.authorization;
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
    });
    const call = chatCaller(provider(base, ''), 'S', []);
    const failure = call([{ role: 'user', content: 'Hi' }], () => {}, new AbortController().signal);
    await expect(failure).rejects.toBeInstanceOf(ProviderError);
    await expect(failure).rejects.toMatchObject({ status: 401, message: 'Invalid API key' });
    expect(auth).toBeUndefined();
  });
});
