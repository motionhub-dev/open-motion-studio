import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../tools';
import { STUDIO_TOOLS, type StudioMcp, answer, mcpContent, startStudioMcp } from '../studio-mcp';

vi.mock('electron', () => ({}));

const tools: ToolContext = {
  dir: '/nowhere',
  build: vi.fn(),
  stage: vi.fn(),
  searchMotions: vi.fn(async () => [{ id: '@hub/calm', name: 'Calm', line: 'Quiet type', fit: '' }]),
  useMotion: vi.fn(),
};

describe('the Studio tools an outside agent gets', () => {
  it('lists only the Studio’s own tools, with their schemas', async () => {
    const listed = (await answer({ id: 1, method: 'tools/list' }, tools, '1.0.0')) as { result: { tools: { name: string; inputSchema: object }[] } };
    expect(listed.result.tools.map((t) => t.name).sort()).toEqual([...STUDIO_TOOLS].sort());
    expect(listed.result.tools.every((t) => typeof t.inputSchema === 'object')).toBe(true);
  });

  it('runs a tool as the built-in agent would, and refuses any other', async () => {
    const called = (await answer({ id: 2, method: 'tools/call', params: { name: 'search_motions', arguments: { words: 'calm' } } }, tools, '1.0.0')) as {
      result: { content: { type: string; text: string }[]; isError: boolean };
    };
    expect(called.result).toEqual({ content: [{ type: 'text', text: '@hub/calm: Calm. Quiet type' }], isError: false });
    expect(await answer({ id: 3, method: 'tools/call', params: { name: 'write_file', arguments: {} } }, tools, '1.0.0')).toMatchObject({ error: { code: -32602 } });
    expect(await answer({ id: 4, method: 'resources/list' }, tools, '1.0.0')).toMatchObject({ error: { code: -32601 } });
    expect(await answer({ method: 'notifications/initialized' }, tools, '1.0.0')).toBeUndefined();
  });

  it('gives a still’s picture as MCP image content', () => {
    expect(
      mcpContent({
        ok: true,
        text: 'At 1 s',
        content: [
          { type: 'text', text: 'At 1 s' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
        ] as never,
      }),
    ).toEqual({ content: [{ type: 'text', text: 'At 1 s' }, { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' }], isError: false });
  });
});

describe('the server', () => {
  let server: StudioMcp | undefined;
  afterEach(() => server?.close());

  it('answers only at its secret path, only POST, and never a browser page', async () => {
    server = await startStudioMcp(tools, '1.0.0');
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f-]{36}$/);
    const post = (url: string, headers: Record<string, string> = {}) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) });
    const ok = await post(server.url);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
    expect((await post(server.url.replace(/[0-9a-f-]{36}$/, 'guess'))).status).toBe(404);
    expect((await post(server.url, { origin: 'https://example.com' })).status).toBe(404);
    expect((await fetch(server.url)).status).toBe(405);
    const notified = await fetch(server.url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    expect(notified.status).toBe(202);
  });
});
