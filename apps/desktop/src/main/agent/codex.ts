// The person's own Codex, through `codex app-server` (ADR 0008): JSON-RPC, one message a line, over the stdio of a
// child started in the project folder. The Studio initializes it, opens (or resumes) the project's thread with the
// film's skill as its instructions, and runs a turn as the panel's events: the agent's words as text, each command,
// file change or tool call as a tool line with its result. Codex works in its workspace sandbox; an approval it asks
// for is declined until the Studio can ask the person (step 7.3). Nothing of the person's sign-in passes through here
// but whether there is one.

import { type ChildProcess, spawn } from 'node:child_process';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent } from '../../shared/api';

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

/** The project's thread: the one it had, resumed, else a new one with the film's skill as its developer instructions. */
export async function openThread(server: AppServer, dir: string, instructions: string, thread?: string): Promise<string> {
  if (thread) {
    try {
      const resumed = await server.request<{ thread: { id: string } }>('thread/resume', { threadId: thread });
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
      case 'mcpToolCall':
        return [{ type: 'tool', id: item.id, name: String(item.tool), summary: `${String(item.server)}: ${String(item.tool)}` }];
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
        const result = item.result as { content?: { type: string; text?: string }[] } | null;
        const text = error ?? (result?.content ?? []).flatMap((c) => (c.type === 'text' && c.text ? [c.text] : [])).join('\n');
        return [{ type: 'tool-result', id: item.id, ok: item.status === 'completed', text: text.slice(0, OUTPUT) }];
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
): Promise<{ ok: boolean; notice?: Notice }> {
  const reading: Reading = { said: false };
  let turnId: string | undefined;
  let finished!: (notice: Notice | undefined) => void;
  const over = new Promise<Notice | undefined>((done) => (finished = done));
  const stop = server.on((method, params) => {
    if (params.threadId !== undefined && params.threadId !== thread) return;
    if (method === 'turn/started') turnId = (params.turn as { id?: string } | undefined)?.id ?? turnId;
    for (const event of translate(method, params, reading)) emit(event);
    if (method === 'turn/completed') finished(turnEnd(params));
    if (method === 'error' && params.willRetry === false) {
      finished({ text: (params.error as { message?: string } | undefined)?.message ?? 'Codex met an error.', error: true });
    }
  });
  // Until the Studio can ask the person (step 7.3), what Codex asks leave to do outside its sandbox is declined, and said.
  server.answer = async (method, params) => {
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      const what = method.includes('command') ? `run ${String(params.command ?? 'a command')}` : 'change files outside the project';
      emit({ type: 'text', text: `\n\n*Codex asked to ${what}; the Studio declined it.*\n\n` });
      return { decision: 'decline' };
    }
    throw new Error(`The Studio does not answer ${method} yet.`);
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
