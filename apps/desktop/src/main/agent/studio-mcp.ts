// The Studio's tools for an outside agent (ADR 0008), as a Model Context Protocol server over streamable HTTP: one
// per session, on 127.0.0.1 at a random port, answering only at a path with a random secret in it, and gone when the
// session ends. It speaks the least of MCP an agent needs (initialize, tools/list, tools/call, ping), with each answer
// as a JSON body and no event stream, and runs the same tools the built-in agent has (tools.ts): checking the film,
// a still of it, the motion catalogue, and a question to the person. A request from a page in a browser (it carries an
// Origin) is refused, so no site can reach it.

import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TOOLS, type ToolContext, type ToolOutcome, runTool } from './tools';

/** The tools an outside agent gets from the Studio: what only the Studio can do; files it reads and writes itself. */
export const STUDIO_TOOLS = ['check', 'still', 'search_motions', 'use_motion', 'ask_person'];

/** The largest request the server reads. */
const MAX_BODY = 1024 * 1024;

type Rpc = { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> };

/** A tool's outcome as MCP content: its text and, for a still, its picture. */
export function mcpContent(outcome: ToolOutcome): { content: object[]; isError: boolean } {
  type Part = { type: string; text?: string; source?: { type: string; media_type?: string; data?: string } };
  const blocks: Part[] = typeof outcome.content === 'string' ? [{ type: 'text', text: outcome.content }] : (outcome.content as Part[]);
  const content: object[] = blocks.flatMap((block): object[] =>
    block.type === 'text'
      ? [{ type: 'text', text: block.text ?? '' }]
      : block.type === 'image' && block.source?.type === 'base64'
        ? [{ type: 'image', data: block.source.data, mimeType: block.source.media_type }]
        : [],
  );
  return { content, isError: !outcome.ok };
}

/** The answer to one JSON-RPC message, or undefined for a notification. */
export async function answer(message: Rpc, tools: ToolContext, version: string): Promise<object | undefined> {
  if (message.id === undefined || message.id === null) return undefined;
  const reply = (result: object) => ({ jsonrpc: '2.0', id: message.id, result });
  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'open-motion-studio', version },
        instructions: "The Studio's own tools for this film: check builds and draws it, still shows a frame, the motions come from motionhub, and ask_person puts one question to the person.",
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({
        tools: TOOLS.filter((tool) => STUDIO_TOOLS.includes(tool.name)).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
        })),
      });
    case 'tools/call': {
      const name = message.params?.name;
      if (typeof name !== 'string' || !STUDIO_TOOLS.includes(name))
        return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: `There is no Studio tool named ${String(name)}.` } };
      return reply(mcpContent(await runTool(name, message.params?.arguments ?? {}, tools)));
    }
    default:
      return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `The Studio does not answer ${String(message.method)}.` } };
  }
}

const read = (request: IncomingMessage) =>
  new Promise<string>((done, fail) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        fail(new Error('Too large.'));
        request.destroy();
      }
    });
    request.on('end', () => done(body));
    request.on('error', fail);
  });

/** A running Studio MCP server: the URL the agent is given, and how to end it. */
export interface StudioMcp {
  url: string;
  close(): void;
}

/** Starts a server for one session's tools. */
export async function startStudioMcp(tools: ToolContext, version: string): Promise<StudioMcp> {
  const path = `/mcp/${randomUUID()}`;
  const send = (response: ServerResponse, status: number, body?: object) => {
    response.writeHead(status, body ? { 'content-type': 'application/json' } : {});
    response.end(body ? JSON.stringify(body) : undefined);
  };
  const server = createServer((request, response) => {
    if (request.url !== path || request.headers.origin) return send(response, 404);
    if (request.method !== 'POST') return send(response, 405);
    read(request).then(
      async (body) => {
        let parsed: Rpc | Rpc[];
        try {
          parsed = JSON.parse(body);
        } catch {
          return send(response, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Not JSON.' } });
        }
        const messages = Array.isArray(parsed) ? parsed : [parsed];
        const answers = (await Promise.all(messages.map((m) => answer(m, tools, version)))).filter((a) => a !== undefined);
        if (!answers.length) return send(response, 202);
        send(response, 200, Array.isArray(parsed) ? answers : answers[0]);
      },
      () => send(response, 413),
    );
  });
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}${path}`, close: () => server.close() };
}
