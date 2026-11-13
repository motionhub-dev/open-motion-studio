// The person's own Codex, through `codex app-server` (ADR 0008): JSON-RPC, one message a line, over the stdio of a
// child started in the project folder. The Studio initializes it, opens (or resumes) the project's thread with the
// film's skill as its instructions and the Studio's MCP server (studio-mcp.ts) as its only one, the person's own
// servers, apps and plugins switched off for the session, and runs a turn as the panel's events: the agent's words as
// text, each command, file change or tool call as a tool line with its result, a Studio tool as the built-in agent's
// would be. Codex works in its workspace sandbox; what it asks leave to do beyond it is a card the person answers
// (allow once, for the session, or deny), except an edit inside the project's writable files, allowed, and one into
// a protected path, refused. Nothing of the person's sign-in passes through here but whether there is one.

import { type ChildProcess, spawn } from 'node:child_process';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, Approval, ApprovalAnswer } from '../../shared/api';
import { moment, question, summary } from './loop';

/** The name the Studio's MCP server has in a Codex session. */
export const STUDIO_SERVER = 'open_motion_studio';

type Params = Record<string, unknown>;
type Notice = { text: string; error: boolean };

/** A JSON-RPC connection to `codex app-server`: requests and their answers, notifications, and its requests of us. */
export class AppServer {
  private child: ChildProcess;
  private next = 0;
  private pending = new Map<number, { done(result: unknown): void; fail(error: Error): void }>();
  private listeners = new Set<(method: string, params: Params) => void>();
  private stderr = '';
  /** Answers a request Codex makes of the Studio; one that throws is answered as an error. */
  answer: (method: string, params: Params) => Promise<unknown> = async (method) => {
    throw new Error(`The Studio does not answer ${method}.`);
  };
  readonly ended: Promise<void>;

  constructor(bin: string, dir: string) {
    this.child = spawn(bin, ['app-server'], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: process.env });
    let buffer = '';
    this.child.stdout!.setEncoding('utf8');
    this.child.stdout!.on('data', (chunk: string) => {
      buffer += chunk;
      for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (line) this.receive(line);
      }
    });
    // What Codex says on stderr is kept, short, for an error that needs it.
    this.child.stderr!.on('data', (chunk: Buffer) => (this.stderr = (this.stderr + String(chunk)).slice(-2000)));
    this.ended = new Promise((done) =>
      this.child.on('close', () => {
        for (const { fail } of this.pending.values()) fail(new Error(`Codex stopped. ${this.lastWords()}`.trim()));
        this.pending.clear();
        done();
      }),
    );
    this.child.on('error', (error) => {
      for (const { fail } of this.pending.values()) fail(error);
      this.pending.clear();
    });
  }

  /** The last line of Codex's own errors, without its colour codes. */
  lastWords(): string {
    return (this.stderr.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').pop() ?? '').slice(0, 300);
  }

  private receive(line: string): void {
    let message: { id?: number | string; method?: string; params?: Params; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.method && message.id !== undefined) {
      const id = message.id;
      this.answer(message.method, message.params ?? {}).then(
        (result) => this.write({ id, result }),
        (error: unknown) => this.write({ id, error: { code: -32601, message: error instanceof Error ? error.message : String(error) } }),
      );
    } else if (message.method) {
      for (const listener of this.listeners) listener(message.method, message.params ?? {});
    } else if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const { done, fail } = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message ?? 'Codex refused the request.'));
      else done(message.result);
    }
  }

  private write(message: object): void {
    this.child.stdin!.write(`${JSON.stringify(message)}\n`);
  }

  request<T>(method: string, params: Params = {}): Promise<T> {
    const id = ++this.next;
    return new Promise<T>((done, fail) => {
      this.pending.set(id, { done: done as (result: unknown) => void, fail });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params?: Params): void {
    this.write(params ? { method, params } : { method });
  }

  /** Listens to Codex's notifications until the returned function is called. */
  on(listener: (method: string, params: Params) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.child.kill();
  }
}

/** Starts `codex app-server` in the project folder and introduces the Studio to it. */
export async function startCodex(bin: string, dir: string, version: string): Promise<AppServer> {
  const server = new AppServer(bin, dir);
  try {
    await Promise.race([
      server.request('initialize', {
        clientInfo: { name: 'open-motion-studio', title: 'Open Motion Studio', version },
        capabilities: { experimentalApi: false, requestAttestation: false },
      }),
      server.ended.then(() => {
        throw new Error(`Codex did not start. ${server.lastWords()}`.trim());
      }),
    ]);
  } catch (error) {
    server.close();
    throw error;
  }
  server.notify('initialized');
  return server;
}

/** Whether the person is signed in to Codex (a ChatGPT account or an API key), asked of Codex itself. */
export async function signedIn(server: AppServer): Promise<boolean> {
  const read = await server.request<{ account: unknown; requiresOpenaiAuth: boolean }>('account/read', {});
  return read.account !== null || !read.requiresOpenaiAuth;
}

/** How long a sign-in in the person's browser may take before the Studio stops waiting for it. */
const SIGN_IN_MS = 10 * 60_000;

/**
 * Signs the person in to Codex with their ChatGPT account, through Codex itself: it starts its own sign-in, `open`
 * shows its page in the person's browser, and this settles when Codex says the sign-in completed, or throws its reason.
 * The server must stay up until then, since the sign-in's callback is Codex's.
 */
export async function signInCodex(server: AppServer, open: (url: string) => void): Promise<void> {
  let stop = () => {};
  const done = new Promise<void>((resolve, reject) => {
    stop = server.on((method, params) => {
      if (method !== 'account/login/completed') return;
      if (params.success) resolve();
      else reject(new Error(typeof params.error === 'string' && params.error ? params.error : 'The sign-in did not complete.'));
    });
  });
  try {
    const started = await server.request<{ type: string; authUrl?: string }>('account/login/start', { type: 'chatgpt' });
    if (!started.authUrl || !/^https:\/\//.test(started.authUrl)) throw new Error('Codex did not give a sign-in page to open.');
    open(started.authUrl);
    await Promise.race([
      done,
      server.ended.then(() => {
        throw new Error(`Codex stopped during the sign-in. ${server.lastWords()}`.trim());
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('The sign-in took too long. Try again from Models.')), SIGN_IN_MS)),
    ]);
  } finally {
    stop();
  }
}

/**
 * The configuration a session runs with: the Studio's MCP server as the only one, each of the person's own switched
 * off by name (Codex adds a session's servers to theirs rather than replacing them), and no apps or plugins.
 */
export function sessionConfig(own: string[], studioUrl: string): Record<string, unknown> {
  return {
    mcp_servers: {
      ...Object.fromEntries(own.filter((name) => name !== STUDIO_SERVER).map((name) => [name, { enabled: false }])),
      [STUDIO_SERVER]: { url: studioUrl },
    },
    features: { apps: false, plugins: false },
  };
}

/**
 * The project's thread: the one it had, resumed, else a new one; either way with the film's skill as its developer
 * instructions and the session's configuration (sessionConfig), since the Studio's server has a new address each run.
 */
export async function openThread(server: AppServer, dir: string, instructions: string, studioUrl: string, thread?: string): Promise<string> {
  const read = await server.request<{ config: { mcp_servers?: Record<string, unknown> } }>('config/read', { cwd: dir });
  const config = sessionConfig(Object.keys(read.config.mcp_servers ?? {}), studioUrl);
  if (thread) {
    try {
      const resumed = await server.request<{ thread: { id: string } }>('thread/resume', {
        threadId: thread,
        developerInstructions: instructions,
        config,
      });
      return resumed.thread.id;
    } catch {
      // A thread Codex no longer has starts again; the panel keeps what was said.
    }
  }
  const started = await server.request<{ thread: { id: string } }>('thread/start', {
    cwd: dir,
    sandbox: 'workspace-write',
    approvalPolicy: 'on-request',
    developerInstructions: instructions,
    config,
  });
  return started.thread.id;
}

type Block = Anthropic.Beta.BetaContentBlockParam;

/** The person's message, as the built-in agent would get it, in Codex's input: its words in one text, its frames as images. */
export function codexInput(content: Block[]): Params[] {
  const text = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n');
  const images = content.flatMap((block) =>
    block.type === 'image' && block.source.type === 'base64' ? [{ type: 'image', url: `data:${block.source.media_type};base64,${block.source.data}` }] : [],
  );
  return [{ type: 'text', text, text_elements: [] }, ...images];
}

/** How far a tool's output is kept for the panel. */
const OUTPUT = 2000;

type Item = Params & { type: string; id: string };

/** Where a turn's translation is: whether the agent has said anything yet, so a second message starts on its own. */
export interface Reading {
  said: boolean;
}

/** What one of Codex's notifications means to the panel, for the turn under way. */
export function translate(method: string, params: Params, reading: Reading): AgentEvent[] {
  const item = params.item as Item | undefined;
  if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    reading.said = true;
    return [{ type: 'text', text: params.delta }];
  }
  if (method === 'item/started' && item) {
    switch (item.type) {
      case 'agentMessage':
        return reading.said ? [{ type: 'text', text: '\n\n' }] : [];
      case 'reasoning':
        return [{ type: 'phase', phase: 'thinking' }];
      case 'commandExecution':
        return [
          { type: 'phase', phase: 'reviewing' },
          { type: 'tool', id: item.id, name: 'shell', summary: `Running ${String(item.command).slice(0, 120)}` },
        ];
      case 'fileChange': {
        const paths = ((item.changes as { path: string }[] | undefined) ?? []).map((c) => c.path);
        const first = paths[0] ?? 'files';
        return [
          { type: 'phase', phase: 'editing' },
          { type: 'tool', id: item.id, name: 'edit_file', summary: `Editing ${first}${paths.length > 1 ? ` and ${paths.length - 1} more` : ''}` },
        ];
      }
      case 'mcpToolCall': {
        const tool = String(item.tool);
        // A Studio tool reads as the built-in agent's: its words, a still's moment, a question's card.
        if (item.server === STUDIO_SERVER) {
          const ask = question(tool, item.arguments);
          return [
            { type: 'phase', phase: tool === 'check' ? 'checking' : 'reviewing' },
            { type: 'tool', id: item.id, name: tool, summary: summary(tool, item.arguments), at: moment(tool, item.arguments), ...(ask ? { ask } : {}) },
          ];
        }
        return [{ type: 'tool', id: item.id, name: tool, summary: `${String(item.server)}: ${tool}` }];
      }
      case 'webSearch':
        return [{ type: 'tool', id: item.id, name: 'web_search', summary: 'Searching the web' }];
      default:
        return [];
    }
  }
  if (method === 'item/completed' && item) {
    switch (item.type) {
      case 'commandExecution': {
        const ok = item.status === 'completed' && (item.exitCode === 0 || item.exitCode === null);
        const output = typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '';
        const text = output ? output.slice(-OUTPUT) : item.status === 'declined' ? 'Declined.' : `Exit code ${String(item.exitCode)}.`;
        return [{ type: 'tool-result', id: item.id, ok, text }];
      }
      case 'fileChange': {
        const changes = (item.changes as { path: string; kind?: { type?: string } }[] | undefined) ?? [];
        const text = changes.map((c) => `${c.kind?.type ?? 'update'} ${c.path}`).join('\n') || String(item.status);
        return [{ type: 'tool-result', id: item.id, ok: item.status === 'completed', text }];
      }
      case 'mcpToolCall': {
        const error = (item.error as { message?: string } | null)?.message;
        const result = item.result as { content?: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean } | null;
        const text = error ?? (result?.content ?? []).flatMap((c) => (c.type === 'text' && c.text ? [c.text] : [])).join('\n');
        const picture = result?.content?.find((c) => c.type === 'image' && c.data);
        return [
          {
            type: 'tool-result',
            id: item.id,
            ok: item.status === 'completed' && !result?.isError,
            text: text.slice(0, OUTPUT),
            ...(picture ? { image: `data:${picture.mimeType ?? 'image/jpeg'};base64,${picture.data}` } : {}),
          },
        ];
      }
      case 'webSearch':
        return [{ type: 'tool-result', id: item.id, ok: true, text: '' }];
      default:
        return [];
    }
  }
  return [];
}

/** How a turn that Codex says has completed ended, for the panel. */
export function turnEnd(params: Params): Notice | undefined {
  const turn = params.turn as { status?: string; error?: { message?: string } | null } | undefined;
  if (turn?.status === 'interrupted') return { text: 'Stopped.', error: false };
  if (turn?.status === 'failed') return { text: turn.error?.message ?? 'Codex could not finish the turn.', error: true };
  return undefined;
}

/** Where a path is to the Studio: in the project's writable files, in a protected part of it, or outside it. */
export type Place = 'project' | 'protected' | 'outside';

/**
 * What the Studio does with a request Codex makes of it: answer it at once, or ask the person with a card and answer
 * by what they choose. `paths` are the files of the file change it concerns (from that item's start), `place` says
 * where a path is.
 */
export function approvalFor(
  method: string,
  params: Params,
  paths: string[],
  place: (path: string) => Place,
): { answer: unknown } | { ask: Omit<Approval, 'id'>; answer(choice: ApprovalAnswer): unknown } {
  const decision = (choice: ApprovalAnswer) => ({ decision: choice === 'once' ? 'accept' : choice === 'session' ? 'acceptForSession' : 'decline' });
  const reason = typeof params.reason === 'string' && params.reason ? params.reason : undefined;
  switch (method) {
    case 'mcpServer/elicitation/request':
      // Codex asks before each MCP tool call; the Studio's own tools need no one's leave. Any other server's is declined.
      return { answer: { action: params.serverName === STUDIO_SERVER ? 'accept' : 'decline', content: params.serverName === STUDIO_SERVER ? {} : null, _meta: null } };
    case 'item/commandExecution/requestApproval':
      return {
        ask: { title: 'Codex asks to run a command', detail: String(params.command ?? 'a command'), ...(reason ? { reason } : {}) },
        answer: decision,
      };
    case 'item/fileChange/requestApproval': {
      const where = paths.map(place);
      if (where.includes('protected')) return { answer: { decision: 'decline' } };
      if (where.length && where.every((w) => w === 'project')) return { answer: { decision: 'accept' } };
      return {
        ask: { title: 'Codex asks to change files outside the project', detail: paths.join('\n') || String(params.grantRoot ?? 'files'), ...(reason ? { reason } : {}) },
        answer: decision,
      };
    }
    case 'item/permissions/requestApproval': {
      const wanted = (params.permissions ?? {}) as { network?: unknown; fileSystem?: unknown };
      const granted = Object.fromEntries(Object.entries(wanted).filter(([, value]) => value !== null && value !== undefined));
      const what = Object.keys(granted).map((k) => (k === 'network' ? 'the network' : 'more of the file system'));
      return {
        ask: { title: `Codex asks for ${what.join(' and ') || 'more permissions'}`, detail: JSON.stringify(granted, null, 1).slice(0, 600), ...(reason ? { reason } : {}) },
        answer: (choice: ApprovalAnswer) =>
          choice === 'deny' ? { permissions: {}, scope: 'turn' } : { permissions: granted, scope: choice === 'session' ? 'session' : 'turn' },
      };
    }
    default:
      throw new Error(`The Studio does not answer ${method}.`);
  }
}

/**
 * Runs one turn on the project's thread: the person's input in, Codex's work out as the panel's events, until Codex
 * says the turn completed. Stopping interrupts the turn. Never throws: a failure ends the turn with a notice.
 */
export async function codexTurn(
  server: AppServer,
  thread: string,
  input: Params[],
  emit: (event: AgentEvent) => void,
  signal: AbortSignal,
  ask: (approval: Omit<Approval, 'id'>) => Promise<ApprovalAnswer>,
  place: (path: string) => Place,
): Promise<{ ok: boolean; notice?: Notice }> {
  const reading: Reading = { said: false };
  /** The files of each file change under way, by item, for the approval it may ask. */
  const changing = new Map<string, string[]>();
  let turnId: string | undefined;
  let finished!: (notice: Notice | undefined) => void;
  const over = new Promise<Notice | undefined>((done) => (finished = done));
  const stop = server.on((method, params) => {
    if (params.threadId !== undefined && params.threadId !== thread) return;
    if (method === 'turn/started') turnId = (params.turn as { id?: string } | undefined)?.id ?? turnId;
    const item = params.item as Item | undefined;
    if (method === 'item/started' && item?.type === 'fileChange')
      changing.set(item.id, ((item.changes as { path: string }[] | undefined) ?? []).map((c) => c.path));
    for (const event of translate(method, params, reading)) emit(event);
    if (method === 'turn/completed') finished(turnEnd(params));
    if (method === 'error' && params.willRetry === false) {
      finished({ text: (params.error as { message?: string } | undefined)?.message ?? 'Codex met an error.', error: true });
    }
  });
  server.answer = async (method, params) => {
    const decided = approvalFor(method, params, changing.get(String(params.itemId)) ?? [], place);
    return 'ask' in decided ? decided.answer(await ask(decided.ask)) : decided.answer;
  };
  const interrupt = () => {
    if (!turnId) return;
    server
      .request('turn/interrupt', { threadId: thread, turnId })
      .catch((error: unknown) => emit({ type: 'text', text: `\n\n*Codex did not stop: ${error instanceof Error ? error.message : String(error)}*\n\n` }));
  };
  signal.addEventListener('abort', interrupt);
  let notice: Notice | undefined;
  try {
    emit({ type: 'phase', phase: 'thinking' });
    const started = await server.request<{ turn: { id: string } }>('turn/start', { threadId: thread, input });
    turnId = started.turn.id;
    if (signal.aborted) interrupt();
    notice = await Promise.race([
      over,
      server.ended.then(() => ({ text: `Codex stopped during the turn. ${server.lastWords()}`.trim(), error: true })),
    ]);
  } catch (error) {
    notice = { text: error instanceof Error ? error.message : String(error), error: true };
  } finally {
    stop();
    signal.removeEventListener('abort', interrupt);
  }
  if (signal.aborted && !notice) notice = { text: 'Stopped.', error: false };
  return { ok: !notice?.error && !signal.aborted, notice };
}
