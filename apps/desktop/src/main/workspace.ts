// A project-owned session: its editor view, agent, previews and tasks survive moving between native windows.

import { studioTranslator } from './providers';
import { BrowserWindow, Notification, app, dialog, shell, type BaseWindow, type IpcMainInvokeEvent, type Session, type OpenDialogOptions, type WebContents } from 'electron';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { log } from './log';
import {
  CHANNELS,
  EVENTS,
  type AgentEvent,
  type AgentKind,
  type AgentModel,
  type Agents,
  type Approval,
  type ApprovalAnswer,
  type BuildResult,
  type ChatItem,
  type HarnessView,
  type Notice,
  type Project,
  type ProjectTask,
  type TurnUsage,
  type VoicedFilm,
  applyEvent,
  ofPicture,
} from '../shared/api';
import type { FilmInfo } from '../shared/preview';
import {
  type AppServer,
  type Place,
  codexChoice,
  codexInput,
  codexModels,
  codexTurn,
  openThread,
  signInCodex,
  signedIn,
  startCodex,
} from './agent/codex';
import { type StudioMcp, startStudioMcp } from './agent/studio-mcp';
import { AgentProblem, CLAUDE_INSTALL, CODEX_INSTALL, findClaude, findCodex } from './agent/harness';
import { CLAUDE_MODELS, ClaudeSession, claudeArgs, newClaudeSession } from './agent/claude';
import { runTurn, transcript } from './agent/loop';
import { markedMessage, readMarks } from './agent/marks';
import { type MessageParam, caller, failure } from './agent/model';
import { testProvider } from './agent/test-connection';
import { TOOLS, type ToolContext, projectPath } from './agent/tools';
import type { BuildContext } from 'esbuild';
import { exportFrames, ffmpegPath, openStage as captureStage, sceneStills, type Stage } from './film/capture';
import { soundPeaks } from './film/mix';
import { voiceFilm } from './narration';
import { speak, voicesOf } from './voice';
import { EXAMPLES } from './examples';
import { ASSET_EXTENSIONS, importAssets, projectAssets, renameAsset, trashAsset } from './assets';
import { projectFileToOpen, projectFiles, readProjectFile } from './files';
import { archiveConversation, pastConversation, pastConversations } from './conversations';
import { reviewBuild } from './film/review';
import { FILM, FILM_SKILL, startFilm, watchFilm } from './film/film';
import { type ExportedSpeech, exportedSpeech, writeRemotionProject } from './film/remotion-export';
import { motionDetail, motionReel, projectMotions, searchMotions, useMotion, removeMotion } from './motions';
import { STATE_DIR, projectAt, rememberProject } from './project';
import { describeReferences, readReferences } from './agent/references';
import { filmSpans } from '../shared/spans';
import { type FileNote, ProjectHistory, changesBetween, inProject, noteFiles, putBack } from './history';
import { NO_TOKENS, type Spent, readUsage, recordUsage, totals } from './usage';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { ProviderStore, providers } from './providers';

const libraryFile = (): string => join(app.getPath('userData'), 'projects.json');


/** A project can have only one writer window, including while it is being opened. */
export type WorkspaceHost = Pick<BrowserWindow, 'webContents' | 'isDestroyed' | 'isFocused' | 'isVisible' | 'setTitle' | 'isMinimized' | 'restore' | 'focus' | 'flashFrame'> & {
  window?(): BaseWindow | null;
};
const projectOwners = new Map<string, WorkspaceHost>();

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export function createWorkspace(host: WorkspaceHost, renderSession: Session, changed: () => void = () => {}) {
  const handlers = new Map<string, Handler>();
  const tasks = new Set<Promise<unknown>>();
  // Which window the project is in is the app's to say (index.ts taskList), not the project's.
  let task: Omit<ProjectTask, 'separate'> | null = null;
  let needsInput = false;
  const taskChannels = new Set<string>([
    CHANNELS.sendMessage, CHANNELS.exportFilm, CHANNELS.exportRemotion, CHANNELS.voiceFilm,
    CHANNELS.importAssets, CHANNELS.importDroppedAssets, CHANNELS.useMotion, CHANNELS.undoTurn, CHANNELS.restoreCheckpoint,
  ]);
  const handle = (channel: string, listener: Handler) => handlers.set(channel, (event, ...args) => {
    const tracked = taskChannels.has(channel) && !working && !exporting && tasks.size === 0 && open;
    if (tracked) {
      needsInput = false;
      const kind = channel === CHANNELS.sendMessage ? 'agent' : channel === CHANNELS.voiceFilm ? 'voice'
        : channel === CHANNELS.exportFilm || channel === CHANNELS.exportRemotion ? 'export' : 'work';
      task = {
        project: tracked.project, kind, status: 'running',
        title: kind === 'agent' && typeof args[0] === 'string' ? args[0].trim().slice(0, 160)
          : kind === 'export' ? 'Export the film' : kind === 'voice' ? 'Voice the film' : 'Working on the film',
        activity: kind === 'agent' ? 'Thinking' : 'Starting',
        startedAt: Date.now(), updatedAt: Date.now(), background: false,
      };
      log('task.started', { channel, kind, projectPath: tracked.project.path });
      changed();
    }
    let result: unknown;
    try {
      result = listener(event, ...args);
    } catch (error) {
      if (tracked && task) { task.status = 'failed'; task.activity = (error as Error).message; changed(); }
      throw error;
    }
    if (tracked && result instanceof Promise) {
      const pending = result.then((value) => {
        if (task) {
          const failed = value && typeof value === 'object' && 'ok' in value && value.ok === false;
          task.status = task.status === 'stopped' ? 'stopped' : failed ? 'failed' : needsInput ? 'waiting' : value === null ? 'stopped' : 'done';
          task.activity = task.status === 'waiting' ? 'Needs your answer' : task.status === 'done' ? 'Completed' : task.status === 'stopped' ? 'Stopped' : task.activity;
          task.updatedAt = Date.now();
        }
        return value;
      }, (error) => {
        if (task) { task.status = 'failed'; task.activity = error.message; task.updatedAt = Date.now(); }
        throw error;
      }).finally(() => {
        if (task) log('task.finished', { channel, kind: task.kind, projectPath: task.project.path, status: task.status, elapsedMs: Date.now() - task.startedAt });
        tasks.delete(pending); changed();
      });
      tasks.add(pending);
      return pending;
    }
    return result;
  });
  handle(CHANNELS.currentProject, () => open?.project ?? null);
  let claimed: string | null = null;
  let opening = false;
  const releaseProject = () => {
    if (claimed && projectOwners.get(claimed) === host) projectOwners.delete(claimed);
    claimed = null;
  };
  const stages = new Set<Stage>();
  const openStage = async (version: number): Promise<Stage> => {
    const source = open;
    const stage = await captureStage(version, renderSession);
    if (host.isDestroyed() || open !== source) {
      stage.close();
      throw new Error('The window was closed.');
    }
    const close = stage.close;
    stage.close = () => {
      stages.delete(stage);
      close();
    };
    stages.add(stage);
    return stage;
  };
  /** The session's project, its film's bundler and conversation. One writer per project. */
  let open: {
    project: Project;
    watcher: BuildContext | null;
    build: BuildResult | null;
    messages: MessageParam[] | null;
    /**
     * The last turn, while it can be taken back: the History entry of what it wrote, and where it starts in `messages`
     * (or, for an outside agent, in its panel items).
     */
    lastTurn?: { checkpoint: string; start: number };
    /** The project's agent, read from `.motion-studio/agent.json` the first time it is asked for. */
    agent?: AgentState;
    /** The person's own Codex, started for this project on its first message to it. */
    codex?: AppServer;
    /** The person's own Claude Code, started for this project on its first message to it, ended by Stop. */
    claude?: ClaudeSession;
    claudeSettings?: string;
    /** The Studio's tools for the outside agent's session (studio-mcp.ts), ended with it. */
    studioMcp?: StudioMcp;
    /**
     * While an outside agent's turn runs, the project's motions as they stand published: as they were when the turn
     * began, and each motion the Studio takes for the agent during it as it was taken. What differs at the turn's end
     * is the agent's edit to a motion, and goes back.
     */
    published?: FileNote;
  } | null = null;

  /**
   * Which agent a project talks to and, for an outside agent (ADR 0008), its thread and the conversation as the panel
   * showed it, since the agent keeps its own record in its own form.
   */
  interface AgentState {
    kind: AgentKind;
    thread?: string;
    items: ChatItem[];
  }
  let exporting: AbortController | null = null;
  /** The file the last export wrote: the one path the renderer may ask to be shown, without naming it. */
  let exported: string | null = null;
  let working: AbortController | null = null;

  const sessionFile = (dir: string): string => join(dir, STATE_DIR, 'session.json');

  /** The open project's conversation, read from disk the first time it is asked for. */
  async function conversation(state: NonNullable<typeof open>): Promise<MessageParam[]> {
    if (state.messages) return state.messages;
    try {
      state.messages = JSON.parse(await readFile(sessionFile(state.project.path), 'utf8')) as MessageParam[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state.messages = [];
    }
    return state.messages;
  }

  async function saveConversation(dir: string, messages: MessageParam[]): Promise<void> {
    await mkdir(join(dir, STATE_DIR), { recursive: true });
    await writeFile(sessionFile(dir), JSON.stringify(messages));
  }

  const agentFile = (dir: string): string => join(dir, STATE_DIR, 'agent.json');

  /** The open project's agent: the built-in one unless the project chose another. */
  async function agentOf(state: NonNullable<typeof open>): Promise<AgentState> {
    if (state.agent) return state.agent;
    try {
      const saved = JSON.parse(await readFile(agentFile(state.project.path), 'utf8')) as Partial<AgentState>;
      state.agent = {
        kind: saved.kind === 'codex' || saved.kind === 'claude' ? saved.kind : 'built-in',
        ...(typeof saved.thread === 'string' ? { thread: saved.thread } : {}),
        items: Array.isArray(saved.items) ? saved.items : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state.agent = { kind: 'built-in', items: [] };
    }
    return state.agent;
  }

  async function saveAgent(dir: string, agent: AgentState): Promise<void> {
    await mkdir(join(dir, STATE_DIR), { recursive: true });
    await writeFile(agentFile(dir), JSON.stringify(agent));
  }

  /** Whether Codex is signed in, as its app-server last said, so Models need not start it on every look. */
  /** When Codex last said it is signed in; a sign-out is asked again every time, so a new sign-in shows at once. */
  let codexSignedInAt = 0;
  /** The models Codex offers, asked once while the app runs: its catalogue changes with Codex, not with the project. */
  let codexListed: AgentModel[] | null = null;

  /** The person's own coding agents and where each stands, with the one thing to do about it. */
  async function harnesses(): Promise<HarnessView[]> {
    const found = await findCodex();
    const codex: HarnessView = { kind: 'codex', name: 'Codex', state: 'missing', hint: 'Install Codex from OpenAI, then check again', link: CODEX_INSTALL };
    if (found.state !== 'found')
      return [
        found.state === 'old'
          ? { ...codex, state: 'old', version: found.version, hint: 'Update Codex from OpenAI to use it here', link: CODEX_INSTALL }
          : codex,
      ];
    if (Date.now() - codexSignedInAt > 60_000) {
      // A short-lived app-server, in the home folder, asked only whether there is a sign-in.
      const server = open?.codex ?? (await startCodex(found.bin, app.getPath('home'), app.getVersion()));
      try {
        if (await signedIn(server)) codexSignedInAt = Date.now();
      } finally {
        if (server !== open?.codex) server.close();
      }
    }
    return [
      Date.now() - codexSignedInAt <= 60_000
        ? { kind: 'codex', name: 'Codex', state: 'ready', version: found.version }
        : { kind: 'codex', name: 'Codex', state: 'signed-out', version: found.version, hint: 'Sign in with your ChatGPT account' },
    ];
  }

  /** The person's own Claude Code and where it stands; it signs in only in a terminal, with its own `claude auth login`. */
  async function claudeHarness(): Promise<HarnessView> {
    const found = await findClaude();
    const claude: HarnessView = { kind: 'claude', name: 'Claude Code', state: 'missing', hint: 'Install Claude Code from Anthropic, then check again', link: CLAUDE_INSTALL };
    if (found.state !== 'found')
      return found.state === 'old' ? { ...claude, state: 'old', version: found.version, hint: 'Update Claude Code to use it here' } : claude;
    return found.signedIn
      ? { kind: 'claude', name: 'Claude Code', state: 'ready', version: found.version }
      : { kind: 'claude', name: 'Claude Code', state: 'signed-out', version: found.version, hint: 'Run `claude auth login` in a terminal to sign in' };
  }

  let pendingChecks: Promise<HarnessView[]> | undefined;
  function unavailable(kind: HarnessView['kind'], name: string, cause: unknown): HarnessView {
    return { kind, name, state: 'unknown', hint: cause instanceof Error ? cause.message : String(cause) };
  }

  async function agents(): Promise<Agents> {
    pendingChecks ??= Promise.all([
      harnesses().catch(e => [unavailable('codex', 'Codex', e)]),
      claudeHarness().catch(e => unavailable('claude', 'Claude Code', e)),
    ]).then(([codex, claude]) => [...codex, claude]).finally(() => { pendingChecks = undefined; });
    const checked = await pendingChecks;
    return { current: open ? (await agentOf(open)).kind : 'built-in', harnesses: checked, settings: await providers().agentSettings() };
  }

  /** The folder whose film the preview scheme serves, while one is open. */
  const previewSource = (): string | null => (open?.project.film ? open.project.path : null);

  /** When the window is not in front, says so in a notification and flashes it in the taskbar. */
  function tellWhenAway(body: string): void {
    if (!host || host.isDestroyed() || host.isFocused()) return;
    if (Notification.isSupported()) new Notification({ title: 'OpenMotionStudio', body }).show();
    host.flashFrame(true);
  }

  function send(channel: string, value: unknown): void {
    if (task) {
      if (channel === EVENTS.agent) {
        const event = value as AgentEvent;
        if (event.type === 'phase') task.activity = { thinking: 'Thinking', editing: 'Editing', checking: 'Checking', reviewing: 'Reviewing' }[event.phase];
        if (event.type === 'tool') { task.activity = event.summary; if (event.ask) needsInput = true; }
        if (event.type === 'approval') { needsInput = true; task.status = 'waiting'; task.activity = 'Needs your approval'; }
        if (event.type === 'approval-done') { needsInput = approvals.size > 0; task.status = needsInput ? 'waiting' : 'running'; }
        if (event.type === 'end') {
          if (working?.signal.aborted) task.status = 'stopped';
          if (event.notice) task.activity = event.notice.text;
        }
      }
      if (channel === EVENTS.exportProgress) { task.progress = value as number; task.activity = 'Rendering video'; }
      if (channel === EVENTS.voiceProgress) {
        const progress = value as { done: number; of: number };
        task.progress = progress.of ? progress.done / progress.of : 0;
        task.activity = `Voicing ${progress.done} of ${progress.of} lines`;
      }
      task.updatedAt = Date.now();
      if (channel !== EVENTS.build && !(channel === EVENTS.agent && (value as AgentEvent).type === 'text')) changed();
    }
    if (host && !host.isDestroyed()) host.webContents.send(channel, value);
  }

  async function closeOpen(release = true): Promise<void> {
    exporting?.abort();
    working?.abort();
    open?.codex?.close();
    open?.claude?.close();
    open?.studioMcp?.close();
    for (const stage of stages) stage.close();
    if (release) releaseProject();
    const watcher = open?.watcher;
    open = null;
    await watcher?.dispose();
  }

  /** Makes `project` the open one: remembers it and, for a film, starts bundling it. */
  async function use(project: Project): Promise<Project> {
    if (opening || working || exporting) throw new Error('Finish or stop the current task before switching projects.');
    opening = true;
    let reserved = false;
    try {
      const path = await realpath(project.path);
      const key = process.platform === 'win32' ? path.toLowerCase() : path;
      const owner = projectOwners.get(key);
      if (owner && owner !== host) {
        if (owner.isDestroyed()) throw new Error('This project is finishing its last task in a closing window. Try opening it again in a moment.');
        if (owner.isMinimized()) owner.restore();
        owner.focus();
        throw new Error('This project is already open in another window. Switch to that window to continue.');
      }
      if (claimed && claimed !== key) projectOwners.delete(claimed);
      claimed = key;
      projectOwners.set(key, host);
      reserved = true;
      await closeOpen(false);
      if (host.isDestroyed()) throw new Error('The window was closed.');
      await rememberProject(libraryFile(), project);
      const state: NonNullable<typeof open> = { project, watcher: null, build: null, messages: null };
      open = state;
      host.setTitle(`${project.name} — OpenMotionStudio`);
      if (project.film) {
        const watcher = await watchFilm(project.path, (result) => {
          if (open !== state) return;
          state.build = result;
          log(result.ok ? 'film.built' : 'film.build-failed', { projectPath: project.path, version: result.version, errors: result.errors });
          send(EVENTS.build, result);
        });
        if (host.isDestroyed() || open !== state) {
          await watcher.dispose();
          throw new Error('The window was closed.');
        }
        state.watcher = watcher;
      }
      return project;
    } catch (error) {
      if (reserved) await closeOpen();
      throw error;
    } finally {
      opening = false;
    }
  }

  /** Asks for one folder, over the window that asked; null when the person cancels. */
  async function chooseFolder(sender: WebContents, options: OpenDialogOptions): Promise<string | null> {
    const window = host.window?.() ?? BrowserWindow.fromWebContents(sender);
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }

  /**
   * Speaks the open film's lines in its voice into voice/ (only what changed), from its latest build, then builds it again
   * so the preview and the agent's check time each line by its speech.
   */
  async function voiceOpenFilm(state: NonNullable<typeof open>): Promise<VoicedFilm> {
    if (state.watcher) await state.watcher.rebuild();
    const build = state.build;
    if (!build?.ok) throw new Error('The film does not build: fix its errors before voicing it.');
    const stage = await openStage(build.version);
    let film: FilmInfo;
    try {
      film = stage.film;
    } finally {
      stage.close();
    }
    const voiced = await voiceFilm(state.project.path, film, (kind) => providers().voiceSetup(kind), ffmpegPath(), (done, of) =>
      send(EVENTS.voiceProgress, { done, of }),
    );
    if (voiced.spoken) {
      await recordUsage(state.project.path, {
        at: new Date().toISOString(),
        voice: film.voice!,
        lines: voiced.spoken,
        characters: voiced.characters,
        speech: Math.round(voiced.seconds * 100) / 100,
      });
    }
    if (open === state && state.watcher) await state.watcher.rebuild();
    return voiced;
  }

  function requireOpen(): NonNullable<typeof open> {
    if (!open) throw new Error('No project is open.');
    return open;
  }

  /** What an outside agent is waiting for the person to answer, by approval id. */
  const approvals = new Map<string, (answer: ApprovalAnswer) => void>();

  /** Where a path Codex names is to the Studio: in the project's writable files, a protected part of it, or outside. */
  function placeIn(dir: string, path: string): Place {
    const full = resolve(dir, path);
    const inside = relative(dir, full);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) return 'outside';
    try {
      projectPath(dir, inside, true);
      return 'project';
    } catch {
      return 'protected';
    }
  }

  /** Adds a turn's account to the project's usage log; a log that cannot be written is said, and the turn goes on. */
  async function logTurn(
    dir: string,
    turn: { agent: AgentKind; usage: TurnUsage; notice?: { error: boolean }; stopped: boolean; tools: number; checkpoint?: string; costUsd?: number },
  ): Promise<void> {
    try {
      await recordUsage(dir, {
        at: new Date().toISOString(),
        agent: turn.agent,
        outcome: turn.stopped ? 'stopped' : turn.notice?.error ? 'failed' : 'done',
        ...turn.usage,
        tools: turn.tools,
        ...(turn.costUsd !== undefined ? { costUsd: turn.costUsd } : {}),
        ...(turn.checkpoint ? { checkpoint: turn.checkpoint } : {}),
      });
    } catch (error) {
      console.error('The turn could not be added to the usage log:', error);
    }
  }

  /**
   * A turn on the person's own Codex (ADR 0008): its app-server started for the project if it is not, the project's
   * thread opened, the turn run with its events sent to the panel and kept as the panel's items, and the files that
   * changed recorded as the turn's checkpoint, since Codex writes them itself.
   */
  async function outsideTurn(
    state: NonNullable<typeof open>,
    agent: AgentState,
    history: ProjectHistory,
    content: Parameters<typeof codexInput>[0],
    text: string,
    marks: ReturnType<typeof readMarks>,
    refs: ReturnType<typeof readReferences>,
    signal: AbortSignal,
  ): Promise<{ ok: boolean }> {
    const dir = state.project.path;
    const began = Date.now();
    let toolCalls = 0;
    const emit = (event: AgentEvent) => {
      if (event.type === 'tool') {
        toolCalls++;
        // The agent names files by their whole path; the panel names them in the project.
        event = { ...event, summary: inProject(event.summary, dir) };
      }
      agent.items = applyEvent(agent.items, event);
      if (open === state) send(EVENTS.agent, event);
    };
    const start = agent.items.length;
    agent.items = [...agent.items, { kind: 'user', text, marks: marks.map(({ t, end, note }) => ({ t, ...(end !== undefined ? { end } : {}), note })), refs }];
    state.lastTurn = undefined;
    let outcome: { ok: boolean; notice?: Notice; spent?: Spent };
    let checkpoint: string | undefined;
    const name = agent.kind === 'claude' ? 'Claude Code' : 'Codex';
    // What Codex asks leave to do is a card in the panel; its answer comes back through answerApproval.
    const ask = (asked: Omit<Approval, 'id'>) =>
      new Promise<ApprovalAnswer>((done) => {
        const id = randomUUID();
        const answer = (choice: ApprovalAnswer) => {
          if (!approvals.has(id)) return;
          approvals.delete(id);
          signal.removeEventListener('abort', deny);
          emit({ type: 'approval-done', id, answer: choice });
          done(choice);
        };
        const deny = () => answer('deny');
        approvals.set(id, answer);
        signal.addEventListener('abort', deny);
        emit({ type: 'approval', approval: { id, ...asked } });
        if (signal.aborted) deny();
      });
    try {
      state.studioMcp ??= await startStudioMcp(
        {
          dir,
          build: async () => {
            if (open !== state || !state.watcher) throw new Error('The project was closed.');
            await state.watcher.rebuild();
            return state.build!;
          },
          stage: (version) => openStage(version),
          searchMotions: (words) => searchMotions(words),
          useMotion: async (id) => {
            const taken = await useMotion(dir, id);
            // Taken by the Studio, so published as it is now: the turn's end must not put it back to absent.
            if (state.published) {
              const folder = taken.path.split(sep).join('/') + '/';
              for (const [path, bytes] of await noteFiles(dir, true)) if (path.startsWith(folder)) state.published.set(path, bytes);
            }
            return taken;
          },
          voiceKinds: async () => (await providers().voices()).map((v) => v.kind),
          voiceChoices: async (kind) => voicesOf(await providers().voiceSetup(kind)),
          voiceFilm: () => voiceOpenFilm(state),
        },
        app.getVersion(),
      );
      const studioUrl = state.studioMcp.url;
      // The agent, started for the project if it is not: its session, and how a turn of it runs.
      let run: (signal: AbortSignal) => Promise<{ ok: boolean; notice?: Notice; spent: Spent }>;
      if (agent.kind === 'claude') {
        const found = await findClaude();
        if (found.state !== 'found')
          throw new AgentProblem(found.state === 'old' ? 'Claude Code is too old for the Studio. Update it to go on.' : 'Claude Code is not installed on this computer.', 'setup');
        if (!found.signedIn) throw new AgentProblem('Claude Code is not signed in. Run `claude auth login` in a terminal, then send again.', 'sign-in');
        const settings = (await providers().agentSettings()).claude;
        const savedSettings = JSON.stringify(settings);
        if (state.claude && state.claudeSettings !== savedSettings) {
          state.claude.close();
          delete state.claude;
        }
        if (!state.claude) {
          const resume = !!agent.thread;
          agent.thread ??= newClaudeSession();
          const session = new ClaudeSession(found.bin, dir, claudeArgs(FILM_SKILL, studioUrl, { id: agent.thread, resume }, settings));
          state.claude = session;
          state.claudeSettings = savedSettings;
          // A session that ends (Stop, or Claude Code's own exit) is started again, resumed, for the next message.
          void session.ended.then(() => {
            if (state.claude === session) delete state.claude;
          });
        }
        const session = state.claude;
        run = (signal) => session.turn(content, emit, signal);
      } else {
        const found = await findCodex();
        if (found.state !== 'found')
          throw new AgentProblem(found.state === 'old' ? 'Codex is too old for the Studio. Update it to go on.' : 'Codex is not installed on this computer.', 'setup');
        state.codex ??= await startCodex(found.bin, dir, app.getVersion());
        const thread = (agent.thread = await openThread(state.codex, dir, FILM_SKILL, studioUrl, agent.thread));
        const codex = state.codex;
        const [read, models, settings] = await Promise.all([
          codex.request<{ config: Parameters<typeof codexChoice>[1] }>('config/read', { cwd: dir }),
          codexListed ?? codexModels(codex).then((listed) => (codexListed = listed)),
          providers().agentSettings(),
        ]);
        const choice = codexChoice(settings.codex, read.config, models);
        run = (signal) => codexTurn(codex, thread, codexInput(content), choice, emit, signal, ask, (path) => placeIn(dir, path));
      }
      await saveAgent(dir, agent);
      const before = await noteFiles(dir);
      const published = (state.published = await noteFiles(dir, true));
      try {
        outcome = await run(signal);
      } finally {
        delete state.published;
      }
      checkpoint = await history.record(changesBetween(before, await noteFiles(dir)));
      // A motion from motionhub is never changed in a project: whatever the agent changed there goes back, and is said.
      const touched = changesBetween(published, await noteFiles(dir, true));
      if (touched.length) {
        await putBack(dir, touched);
        emit({
          type: 'text',
          text: `\n\n*${name} changed ${touched.map((c) => c.path).join(', ')}, part of a motion from motionhub, which a project never changes. The Studio put ${touched.length === 1 ? 'it' : 'them'} back.*\n\n`,
        });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      outcome = { ok: false, notice: { text, error: true, ...(error instanceof AgentProblem ? { need: error.need } : {}) } };
    }
    const spent = outcome.spent ?? { tokens: NO_TOKENS, calls: 0 };
    const usage: TurnUsage = { ...spent.tokens, calls: spent.calls, seconds: (Date.now() - began) / 1000, ...(spent.model ? { model: spent.model } : {}) };
    // Logged before the turn ends, so the panel reads it with the turn.
    await logTurn(dir, { agent: agent.kind, usage, notice: outcome.notice, stopped: signal.aborted, tools: toolCalls, checkpoint, costUsd: spent.costUsd });
    emit({ type: 'end', notice: outcome.notice, checkpoint, files: history.files, usage });
    if (checkpoint) state.lastTurn = { checkpoint, start };
    await saveAgent(dir, agent);
    return { ok: outcome.ok };
  }

  function registerHandlers(): void {
    handle(CHANNELS.examples, () => EXAMPLES);
    handle(CHANNELS.projectAssets, () => projectAssets(requireOpen().project.path));
    handle(CHANNELS.importAssets, async (event) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before importing files.');
      const controller = new AbortController();
      working = controller;
      try {
        const window = host.window?.() ?? BrowserWindow.fromWebContents(event.sender);
        const options: OpenDialogOptions = {
          title: (await studioTranslator())('Bring images, fonts and sounds into your film'),
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images, fonts and sounds', extensions: ASSET_EXTENSIONS }],
        };
        const chosen = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
        if (chosen.canceled) return projectAssets(state.project.path);
        if (open !== state) throw new Error('The project was closed.');
        return importAssets(state.project.path, chosen.filePaths);
      } finally {
        if (working === controller) working = null;
      }
    });
    handle(CHANNELS.projectFiles, () => projectFiles(requireOpen().project.path));
    handle(CHANNELS.readProjectFile, (_event, path: unknown) => readProjectFile(requireOpen().project.path, path));
    handle(CHANNELS.openProjectFile, async (_event, path: unknown) => {
      const error = await shell.openPath(await projectFileToOpen(requireOpen().project.path, path));
      if (error) throw new Error(error);
    });
    handle(CHANNELS.renameAsset, async (_event, path: unknown, name: unknown) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before renaming a file.');
      return renameAsset(state.project.path, path, name);
    });
    handle(CHANNELS.trashAsset, async (_event, path: unknown) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before removing a file.');
      return trashAsset(state.project.path, path, (file) => shell.trashItem(file));
    });
    handle(CHANNELS.importDroppedAssets, async (_event, paths: unknown) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before importing files.');
      if (!Array.isArray(paths) || paths.length > 50 || !paths.every((p) => typeof p === 'string' && isAbsolute(p)))
        throw new Error('Drop files from your computer to import them.');
      const controller = new AbortController();
      working = controller;
      try {
        return await importAssets(state.project.path, paths as string[]);
      } finally {
        if (working === controller) working = null;
      }
    });


    handle(CHANNELS.startFilm, async () => {
      const { project } = requireOpen();
      await startFilm(project.path);
      return use(projectAt(project.path));
    });

    handle(CHANNELS.reviewFilm, async () => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Wait for the current task to finish before checking.');
      const controller = new AbortController();
      working = controller;
      try {
        const result = await reviewBuild(state.build, openStage, controller.signal);
        if (open !== state || state.build?.version !== result.version) throw new Error('The film changed during the check. Check it again.');
        return result;
      } finally {
        if (working === controller) working = null;
      }
    });

    handle(CHANNELS.history, () => new ProjectHistory(requireOpen().project.path).list());
    handle(CHANNELS.undoTurn, async (_event, checkpoint: unknown) => {
      const state = requireOpen();
      if (typeof checkpoint !== 'string') throw new Error('Choose a turn to undo.');
      if (working || exporting) throw new Error('Wait for the current task to finish before undoing.');
      const history = new ProjectHistory(state.project.path);
      const turn = state.lastTurn;
      if (turn?.checkpoint !== checkpoint || (await history.list())[0]?.id !== checkpoint)
        throw new Error('Only the last turn can be undone here, before anything else changes. Use History for earlier changes.');
      const agent = await agentOf(state);
      const messages = await conversation(state);
      const said = agent.kind === 'built-in' ? transcript(messages.slice(turn.start, turn.start + 1))[0] : agent.items[turn.start];
      const controller = new AbortController();
      working = controller;
      try {
        await history.restore(checkpoint);
        await state.watcher?.rebuild();
        state.lastTurn = undefined;
        if (agent.kind === 'built-in') {
          state.messages = messages.slice(0, turn.start);
          await saveConversation(state.project.path, state.messages);
        } else {
          // The files go back; an outside agent's own record of the turn stays, and the panel says so.
          agent.items = [
            ...agent.items.slice(0, turn.start),
            {
              kind: 'notice',
              text: `The files are back as they were. ${agent.kind === 'claude' ? 'Claude Code' : 'Codex'} still remembers the turn you undid.`,
              error: false,
            },
          ];
          await saveAgent(state.project.path, agent);
        }
        return { text: said?.kind === 'user' ? said.text : '' };
      } finally {
        if (working === controller) working = null;
      }
    });
    handle(CHANNELS.restoreCheckpoint, async (_event, id: unknown) => {
      const state = requireOpen();
      if (typeof id !== 'string') throw new Error('Choose a checkpoint.');
      if (working || exporting) throw new Error('Wait for the current task to finish before restoring.');
      const controller = new AbortController();
      working = controller;
      try {
        await new ProjectHistory(state.project.path).restore(id);
        await state.watcher?.rebuild();
        state.messages = [];
        state.lastTurn = undefined;
        await saveConversation(state.project.path, []);
        // A restored project starts a fresh conversation with an outside agent too, on a new thread.
        const agent = await agentOf(state);
        if (agent.kind !== 'built-in') await saveAgent(state.project.path, { kind: agent.kind, items: (agent.items = []) });
        delete agent.thread;
      } finally {
        if (working === controller) working = null;
      }
    });

    handle(CHANNELS.lastBuild, () => open?.build ?? null);

    // One photographing of the scenes at a time; a request whose build is no longer the latest by its turn is let go.
    let stillsQueue: Promise<unknown> = Promise.resolve();
    handle(CHANNELS.sceneStills, (_event, version: unknown) => {
      if (typeof version !== 'number' || !Number.isInteger(version)) throw new Error('Name a build of the film.');
      const run = stillsQueue.then(async () => {
        const state = open;
        if (!state?.build?.ok || state.build.version !== version) return null;
        return sceneStills(state.project.path, version, openStage);
      });
      stillsQueue = run.catch(() => {});
      return run;
    });
    handle(CHANNELS.voices, () => providers().voices());
    handle(CHANNELS.saveVoice, (_event, input: unknown) => providers().saveVoice(input));
    handle(CHANNELS.removeVoice, (_event, kind: unknown) => providers().removeVoice(kind));
    handle(CHANNELS.voiceChoices, async (_event, input: unknown) => {
      const draft = input as { kind?: unknown } | null;
      return voicesOf(await providers().voiceSetup(draft?.kind, input));
    });
    handle(CHANNELS.sampleVoice, async (_event, input: unknown, voice: unknown, text: unknown) => {
      if (typeof voice !== 'string' || !/^[\w.:-]{1,120}$/.test(voice)) throw new Error('Choose a voice to hear.');
      if (typeof text !== 'string' || !text.trim() || text.length > 300) throw new Error('A sample is a sentence of up to 300 characters.');
      const draft = input as { kind?: unknown } | null;
      const speech = await speak(await providers().voiceSetup(draft?.kind, input), voice, text.trim());
      return `data:audio/mpeg;base64,${speech.audio.toString('base64')}`;
    });
    // The film's lines spoken in its voice into voice/, then the film built again, so the preview times them by their speech.
    handle(CHANNELS.voiceFilm, async () => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before voicing the film.');
      const controller = new AbortController();
      working = controller;
      try {
        return await voiceOpenFilm(state);
      } finally {
        if (working === controller) working = null;
      }
    });
    handle(CHANNELS.soundPeaks, (_event, src: unknown) => {
      if (typeof src !== 'string') throw new Error('Name a sound of the film.');
      return soundPeaks(requireOpen().project.path, ffmpegPath(), src);
    });

    handle(CHANNELS.projectMotions, () => projectMotions(requireOpen().project.path));
    handle(CHANNELS.searchMotions, (_event, words: unknown) => searchMotions(typeof words === 'string' ? words : ''));
    handle(CHANNELS.useMotion, async (_event, id: unknown) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before adding a motion.');
      const controller = new AbortController();
      working = controller;
      try {
        return await useMotion(state.project.path, id);
      } finally {
        if (working === controller) working = null;
      }
    });
    handle(CHANNELS.removeMotion, async (_event, id: unknown) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before removing a motion.');
      await removeMotion(state.project.path, id);
    });
    handle(CHANNELS.motionReel, (_event, id: unknown) => motionReel(requireOpen().project.path, id));
    handle(CHANNELS.motionDetail, (_event, id: unknown) => motionDetail(requireOpen().project.path, id));

    handle(CHANNELS.providers, () => providers().list());
    handle(CHANNELS.saveProvider, (_event, input: unknown) => {
      if (!input || typeof input !== 'object') throw new Error('Not a provider.');
      return providers().save(input as Parameters<ProviderStore['save']>[0]);
    });
    handle(CHANNELS.removeProvider, (_event, id: unknown) => providers().remove(id));
    handle(CHANNELS.activateProvider, (_event, id: unknown) => providers().activate(id));
    handle(CHANNELS.testProvider, async (_event, input: unknown) => {
      if (!input || typeof input !== 'object') throw new Error('Not a provider.');
      return testProvider(await providers().draft(input as Parameters<ProviderStore['draft']>[0]));
    });

    handle(CHANNELS.agents, () => agents());
    handle(CHANNELS.signInAgent, async (_event, kind: unknown) => {
      if (kind !== 'codex') throw new Error('Choose an agent to sign in to.');
      const found = await findCodex();
      if (found.state !== 'found') throw new Error('Codex is not ready to sign in: Models says what it needs first.');
      // Codex's own sign-in, in the person's browser; its server stays up until Codex says it is done.
      const server = open?.codex ?? (await startCodex(found.bin, app.getPath('home'), app.getVersion()));
      try {
        await signInCodex(server, (url) => void shell.openExternal(url));
        codexSignedInAt = 0;
      } finally {
        if (server !== open?.codex) server.close();
      }
      return agents();
    });
    handle(CHANNELS.agentModels, async (_event, kind: unknown) => {
      if (kind === 'claude') return CLAUDE_MODELS;
      if (kind !== 'codex') throw new Error('Choose an agent.');
      if (codexListed) return codexListed;
      const found = await findCodex();
      if (found.state !== 'found') throw new Error('Codex is not ready: Models says what it needs first.');
      const server = open?.codex ?? (await startCodex(found.bin, app.getPath('home'), app.getVersion()));
      try {
        return (codexListed = await codexModels(server));
      } finally {
        if (server !== open?.codex) server.close();
      }
    });
    handle(CHANNELS.saveAgentSettings, async (_event, kind: unknown, settings: unknown) => {
      if (kind !== 'claude' && kind !== 'codex') throw new Error('Choose an agent.');
      if (working) throw new Error('Finish the current turn before changing how the agent runs.');
      await providers().saveAgentSettings(kind, settings);
      // Claude Code takes its settings when it starts: the next message starts it again, resuming the session.
      if (kind === 'claude') open?.claude?.close();
      return agents();
    });
    handle(CHANNELS.answerApproval, (_event, id: unknown, answer: unknown) => {
      if (typeof id !== 'string' || (answer !== 'once' && answer !== 'session' && answer !== 'deny')) throw new Error('Not an answer.');
      const waiting = approvals.get(id);
      if (!waiting) throw new Error('That request was already answered, or its turn ended.');
      waiting(answer);
    });
    handle(CHANNELS.useAgent, async (_event, kind: unknown) => {
      const state = requireOpen();
      if (kind !== 'built-in' && kind !== 'codex' && kind !== 'claude') throw new Error('Choose an agent.');
      if (working || exporting) throw new Error('Finish the current task before changing the agent.');
      const outside = kind === 'built-in' ? undefined : (await agents()).harnesses.find((h) => h.kind === kind);
      if (outside && outside.state !== 'ready') throw new Error(`${outside.name} is not ready on this computer. Models says what it needs.`);
      const agent = await agentOf(state);
      if (agent.kind !== kind) {
        // Each agent has its own conversation; switching starts the new one's afresh.
        state.agent = { kind, items: [] };
        state.lastTurn = undefined;
        state.codex?.close();
        state.claude?.close();
        state.studioMcp?.close();
        delete state.codex;
        delete state.claude;
        delete state.studioMcp;
        await saveAgent(state.project.path, state.agent);
      }
      return agents();
    });
    handle(CHANNELS.conversation, async () => {
      if (!open) return [];
      const agent = await agentOf(open);
      return agent.kind === 'built-in' ? transcript(await conversation(open)) : agent.items;
    });
    handle(CHANNELS.pastConversations, () => pastConversations(requireOpen().project.path));
    handle(CHANNELS.pastConversation, (_event, id: unknown) => pastConversation(requireOpen().project.path, id));
    handle(CHANNELS.clearConversation, async () => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Finish the current task before starting a new conversation.');
      // The conversation set aside is kept, as it was shown, among the project's past ones.
      const before = await agentOf(state);
      await archiveConversation(state.project.path, before.kind === 'built-in' ? transcript(await conversation(state)) : before.items);
      state.messages = [];
      state.lastTurn = undefined;
      await saveConversation(state.project.path, []);
      const agent = await agentOf(state);
      if (agent.kind !== 'built-in') {
        state.agent = { kind: agent.kind, items: [] };
        await saveAgent(state.project.path, state.agent);
      }
    });
    handle(CHANNELS.stopAgent, () => working?.abort());
    handle(CHANNELS.projectUsage, async () => totals(await readUsage(requireOpen().project.path)));
    // Words into the turn that runs, for Claude Code alone, which takes a message mid-turn; else they wait for its end.
    handle(CHANNELS.steerAgent, async (_event, text: unknown) => {
      const state = requireOpen();
      if (typeof text !== 'string' || !text.trim()) throw new Error('Write a message first.');
      const agent = await agentOf(state);
      if (!working || agent.kind !== 'claude' || !state.claude?.steer([{ type: 'text', text: text.trim() }])) return false;
      agent.items = [...agent.items, { kind: 'user', text: text.trim(), marks: [] }];
      return true;
    });
    handle(CHANNELS.sendMessage, async (_event, text: unknown, rawMarks: unknown, rawRefs: unknown, version: unknown) => {
      const state = requireOpen();
      const marks = readMarks(rawMarks);
      const refs = readReferences(rawRefs);
      if (
        (marks.length || refs.some(ofPicture)) &&
        (!state.build?.ok || version !== state.build.version)
      ) {
        throw new Error('The preview changed. Select your references again before sending.');
      }
      if (typeof text !== 'string' || (!text.trim() && !marks.length && !refs.length)) throw new Error('Write a message first.');
      if (!state.project.film) throw new Error('Start a film in this folder first.');
      if (working || exporting) throw new Error('Wait for the current task to finish.');
      const controller = new AbortController();
      working = controller;
      try {
        const agent = await agentOf(state);
        const provider = agent.kind === 'built-in' ? await providers().active() : null;
        const dir = state.project.path;
        const history = new ProjectHistory(dir, text.trim());
        const tools: ToolContext = {
          dir,
          write: (path, content, expected) => history.write(path, content, expected),
          build: async () => {
            if (open !== state || !state.watcher) throw new Error('The project was closed.');
            await state.watcher.rebuild();
            return state.build!;
          },
          stage: (version) => openStage(version),
          searchMotions: (words) => searchMotions(words),
          useMotion: (id) => useMotion(dir, id),
          voiceKinds: async () => (await providers().voices()).map((v) => v.kind),
          voiceChoices: async (kind) => voicesOf(await providers().voiceSetup(kind)),
          voiceFilm: () => voiceOpenFilm(state),
        };
        // Where film.tsx writes each marked or referenced scene, layer and line, for the agent to read first.
        const locate = filmSpans(await readFile(join(dir, FILM), 'utf8'));
        // A model that reads images sees each marked moment; any other reads the marks described.
        const content = await markedMessage(
          text.trim(),
          marks,
          provider ? provider.images !== false : true,
          async () => {
            if (!state.build?.ok || state.build.version !== version) throw new Error('The preview changed. Select your references again.');
            return openStage(state.build.version);
          },
          locate,
        );
        if (refs.length) content.push({ type: 'text', text: describeReferences(refs, typeof version === 'number' ? version : 0, locate) });
        if (!provider) {
          const outcome = await outsideTurn(state, agent, history, content, text.trim(), marks, refs, controller.signal);
          const name = agent.kind === 'claude' ? 'Claude Code' : 'Codex';
          tellWhenAway(outcome.ok ? `${name} finished its turn.` : `${name} stopped. See the conversation.`);
          return outcome;
        }
        const messages = await conversation(state);
        const start = messages.length;
        let toolCalls = 0;
        let logged: Promise<void> = Promise.resolve();
        state.lastTurn = undefined;
        const outcome = await runTurn(
          {
            messages,
            content,
            call: caller(provider, FILM_SKILL, TOOLS),
            tools,
            emit: (event: AgentEvent) => {
              if (event.type === 'tool') toolCalls++;
              if (event.type === 'end' && event.usage) {
                // The model is the provider's; the turn is logged as it ends.
                event = { ...event, files: history.files, usage: { ...event.usage, model: provider.model } };
                logged = logTurn(dir, { agent: 'built-in', usage: event.usage!, notice: event.notice, stopped: controller.signal.aborted, tools: toolCalls, checkpoint: event.checkpoint });
              }
              if (open === state) send(EVENTS.agent, event);
            },
            save: (messages) => saveConversation(dir, messages),
            signal: controller.signal,
            checkpoint: () => history.checkpoint,
          },
          (error) => failure(error, provider.name),
        );
        // The message is answered once its turn is in the log.
        await logged;
        const checkpoint = history.checkpoint;
        if (checkpoint) state.lastTurn = { checkpoint, start };
        tellWhenAway(outcome.ok ? 'The agent finished its turn.' : 'The agent stopped. See the conversation.');
        return outcome;
      } finally {
        if (working === controller) working = null;
      }
    });

    handle(CHANNELS.exportFilm, async (event) => {
      const state = requireOpen();
      if (exporting || working) throw new Error('Wait for the current task to finish before exporting.');
      const build = state.build;
      if (!state.project.film || !build?.ok) throw new Error('The film does not build: fix its errors before exporting.');
      const controller = new AbortController();
      exporting = controller;
      try {
        const review = await reviewBuild(build, openStage, controller.signal);
        const errors = review.issues.filter((issue) => issue.severity === 'error');
        if (errors.length) throw new Error(`Before exporting: ${errors.map((issue) => issue.text).join('\n')}`);
        const window = host.window?.() ?? BrowserWindow.fromWebContents(event.sender);
        const options = {
          title: (await studioTranslator())('Export the film'),
          defaultPath: join(state.project.path, `${state.project.name}.mp4`),
          filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
        };
        const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        controller.signal.throwIfAborted();
        if (open !== state || state.build?.version !== build.version)
          throw new Error('The film changed before export. Review the latest preview and export again.');
        await exportFrames(state.project.path, build.version, result.filePath, (done) => send(EVENTS.exportProgress, done), controller.signal, openStage);
        exported = result.filePath;
        return result.filePath;
      } finally {
        if (exporting === controller) exporting = null;
      }
    });

    handle(CHANNELS.cancelExport, () => exporting?.abort());
    handle(CHANNELS.exportRemotion, async (event) => {
      const state = requireOpen();
      if (working || exporting) throw new Error('Wait for the current task to finish before exporting.');
      const { build } = state;
      if (!state.project.film || !build?.ok) throw new Error('The film does not build: fix its errors before exporting.');
      const controller = new AbortController();
      exporting = controller;
      try {
        const tr = await studioTranslator();
        const path = await chooseFolder(event.sender, {
          title: tr('Choose an empty folder for the Remotion project'),
          buttonLabel: tr('Export'),
          properties: ['openDirectory', 'createDirectory'],
        });
        if (path === null) return null;
        if (open !== state || state.build?.version !== build.version)
          throw new Error('The film changed before export. Review the latest version and export again.');
        // The scenes as the film has them now, from the build the person sees.
        const stage = await openStage(build.version);
        let scenes: string[];
        let sounds: string[];
        let speech: ExportedSpeech;
        try {
          scenes = stage.film.scenes.map((scene) => scene.id);
          sounds = stage.film.sounds.map((sound) => sound.src);
          speech = exportedSpeech(stage.film);
        } finally {
          stage.close();
        }
        if (state.build?.version !== build.version)
          throw new Error('The film changed before export. Review the latest version and export again.');
        await writeRemotionProject(state.project.path, path, state.project.name, scenes, sounds, speech);
        exported = path;
        return path;
      } finally {
        if (exporting === controller) exporting = null;
      }
    });
    handle(CHANNELS.showExported, () => {
      if (exported) shell.showItemInFolder(exported);
    });
  }

  registerHandlers();
  return {
    handlers,
    open: use,
    close: closeOpen,
    previewSource,
    project: () => open?.project ?? null,
    busy: () => tasks.size > 0 || !!working || !!exporting,
    task: (): Omit<ProjectTask, 'separate'> | null => task ? { ...task, background: host.isDestroyed() || !host.isVisible() } : null,
    async dispose() {
      await closeOpen(false);
      // A stopped turn still records its conversation, checkpoint and usage before the app exits.
      await Promise.allSettled([...tasks]);
      releaseProject();
    },
  };
}
