// The one surface the renderer reaches the main process through. The preload script
// implements it with ipcRenderer on the channels below; the main process registers a
// handler for each and validates whatever the renderer sends.

export interface Project {
  /** The folder's name, as the Studio shows it. */
  name: string;
  /** The absolute path of the folder. */
  path: string;
  /** The path as the Studio shows it: the home folder written `~`. */
  display: string;
  /** Whether it holds a film (film.tsx); a folder that does not is offered one. */
  film: boolean;
}

/** The film's bundle, rebuilt whenever a file it imports changes. */
export interface BuildResult {
  ok: boolean;
  /** Counts builds, so a page can ask for the bundle it was told about. */
  version: number;
  /** The bundler's errors, formatted as it prints them. */
  errors: string[];
}

/** A motion in motionhub.dev's catalogue. */
export interface CatalogueMotion {
  /** `@<scope>/<slug>`. */
  id: string;
  version: string;
  name: string;
  line: string;
  /** What it is for, in its own words, or ''. */
  fit: string;
  tags: string[];
  /** The poster's address, or null. */
  poster: string | null;
  /** Its page on motionhub.dev. */
  page: string;
}

/** A motion the open project holds, in motions/. */
export interface ProjectMotion {
  /** `@<scope>/<slug>` for one taken from the hub, its folder's name for the project's own. */
  id: string;
  /** Its folder, relative to the project. */
  path: string;
  name: string;
  line: string;
  /** The version the lock records, or null. */
  version: string | null;
  fromHub: boolean;
  /** Its poster, relative to the project, or null. */
  poster: string | null;
}

/** What a motion in the project holds, for its page in the motion panel. */
export interface MotionDetail {
  motion: ProjectMotion;
  /** Its MOTION.md, as written. */
  markdown: string;
  /** Its colour tokens, by name. */
  colors: { name: string; value: string }[];
  /** Its components, from each file's `meta`. */
  components: { file: string; name: string; purpose: string; line: string; preview: string | null }[];
}

/** The wire protocols a provider may speak. */
export type Protocol = 'anthropic' | 'openai';

/** A model provider as the renderer sees it: never its key. */
/** Which agent a project talks to: the built-in one on the active provider, or the person's own Codex (ADR 0008). */
export type AgentKind = 'built-in' | 'codex';

/** Where a person's own coding agent stands: not installed, too old, installed but not signed in, or ready. */
export type HarnessState = 'missing' | 'old' | 'signed-out' | 'ready';

/** A person's own coding agent as the composer and Models show it. */
export interface HarnessView {
  kind: Exclude<AgentKind, 'built-in'>;
  name: string;
  state: HarnessState;
  version?: string;
  /** What to do about a state that is not ready, in a few words. */
  hint?: string;
}

/** The project's agent and the coding agents on this machine. */
export interface Agents {
  current: AgentKind;
  harnesses: HarnessView[];
}

export interface ProviderView {
  id: string;
  name: string;
  /** Anthropic Messages, or OpenAI Chat Completions. */
  protocol: Protocol;
  /** Where it is reached: for Chat Completions, the address before /chat/completions. */
  baseUrl: string;
  model: string;
  /** Whether the model reads images, so the agent's stills are sent to it as pictures. */
  images: boolean;
  hasKey: boolean;
  /** Whether the agent can call it: it has a key, or it is on this machine and needs none. */
  ready: boolean;
}

export interface Providers {
  providers: ProviderView[];
  /** The provider the agent runs on, or null. */
  active: string | null;
  /** True where this machine has no keychain and keys are sealed with a fixed secret (Linux without a keyring). */
  weakKeyStorage: boolean;
}

/** A provider to add (no id) or change. A key, when given, replaces the stored one. */
export interface ProviderInput {
  id?: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  model: string;
  images: boolean;
  key?: string;
}

import type { Box, PickedElement } from './preview';

/** A place the person marked on the picture, or a stretch of the timeline, sent with their next message. */
export interface Mark {
  /** Seconds into the film. */
  t: number;
  /** Where a stretch marked on the timeline ends; such a mark's box is the whole frame. */
  end?: number;
  /** The marked box, in fractions of the frame. */
  box: Box;
  /** The element picked there, or null for a region dragged out or a stretch of time. */
  element: PickedElement | null;
  /** What the person says should change there; may be empty. */
  note: string;
}

/** The longest note a mark carries. */
export const MARK_NOTE = 300;

/** A mark as the conversation shows it once sent: its moment, its note and, for a model that reads images, the frame it saw. */
export interface SentMark {
  t: number;
  end?: number;
  note: string;
  /** The frame the model was sent, as a data: URL. */
  image?: string;
}

/** A source-aware reference, attached separately from the creator's words. */
export interface Reference {
  kind: 'scene' | 'layer' | 'line' | 'asset' | 'issue';
  label: string;
  scene?: string;
  layer?: string;
  line?: string;
  time?: number;
  path?: string;
  detail?: string;
  /** Where film.tsx writes it, `film.tsx:12-18`, added when the message is sent. */
  source?: string;
}

/** The most marks one message may carry. */
export const MAX_MARKS = 5;

/** What a connection test found. */
export type ProviderTest = { ok: true; ms: number; calledTool: boolean } | { ok: false; error: string };

/** One entry of the conversation, as the assistant panel shows it. */
export type ChatItem =
  | { kind: 'user'; text: string; marks: SentMark[]; refs?: Reference[]; version?: number }
  | { kind: 'assistant'; text: string }
  | {
      kind: 'tool';
      id: string;
      name: string;
      summary: string;
      at?: number;
      /** For ask_person: the question the agent put to the person, and the answers it offers. */
      ask?: Question;
      result?: { ok: boolean; text: string; image?: string };
    }
  | { kind: 'notice'; text: string; error: boolean };

/** What the agent reports while it works. */
export type AgentEvent =
  | { type: 'phase'; phase: 'thinking' | 'editing' | 'checking' | 'reviewing' }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; summary: string; at?: number; ask?: Question }
  | { type: 'tool-result'; id: string; ok: boolean; text: string; image?: string }
  /** `checkpoint` is the History entry of the files the turn wrote, if it wrote any. */
  | { type: 'end'; notice?: { text: string; error: boolean }; checkpoint?: string };

/** The conversation with one more of the agent's events in it: its words joined, each tool call and then its result. */
export function applyEvent(items: ChatItem[], event: AgentEvent): ChatItem[] {
  switch (event.type) {
    case 'text': {
      const last = items[items.length - 1];
      if (last?.kind === 'assistant') return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: 'assistant', text: event.text }];
    }
    case 'tool':
      return [...items, { kind: 'tool', id: event.id, name: event.name, summary: event.summary, at: event.at, ask: event.ask }];
    case 'tool-result':
      return items.map((item) =>
        item.kind === 'tool' && item.id === event.id ? { ...item, result: { ok: event.ok, text: event.text, image: event.image } } : item,
      );
    case 'end':
      return event.notice ? [...items, { kind: 'notice', ...event.notice }] : items;
    default:
      return items;
  }
}

/** A question the agent puts to the person, ending its turn: their answer is their next message. */
export interface Question {
  question: string;
  options: string[];
}

export interface Checkpoint {
  restored?: boolean;
  id: string;
  label: string;
  createdAt: string;
  files: string[];
}

export interface FilmIssue {
  id: string;
  kind: 'build' | 'runtime' | 'layout' | 'export';
  severity: 'error' | 'warning';
  text: string;
  time?: number;
  scene?: string;
}
export interface FilmReview {
  version: number;
  issues: FilmIssue[];
  checkedFrames: number;
  film?: import('./preview').FilmInfo;
}

export interface Example {
  id: string;
  name: string;
  line: string;
  title: string;
  seconds: number;
}
export interface Asset {
  path: string;
  name: string;
  kind: 'image' | 'font';
  bytes: number;
}

export interface StudioApi {
  examples(): Promise<Example[]>;
  openExample(id: string): Promise<Project>;
  projectAssets(): Promise<Asset[]>;
  importAssets(): Promise<Asset[]>;
  reviewFilm(): Promise<FilmReview>;
  history(): Promise<Checkpoint[]>;
  restoreCheckpoint(id: string): Promise<void>;
  /**
   * Takes back the agent's last turn: its files as they were before it (its History entry, which must be the latest)
   * and the conversation as it was before the person's message, whose words come back to put in the composer.
   */
  undoTurn(checkpoint: string): Promise<{ text: string }>;
  /** Recent projects, most recent first, without folders that no longer exist. */
  recentProjects(): Promise<Project[]>;
  /** Asks for a folder and opens it; null when the person cancels. */
  openProject(): Promise<Project | null>;
  /** Asks for an empty (or new) folder and starts a film in it; null when the person cancels. */
  createProject(): Promise<Project | null>;
  /** Opens a folder from the recent list; any other path is refused. */
  openRecent(path: string): Promise<Project>;
  /** Starts a film in the open project, which holds none yet. */
  startFilm(): Promise<Project>;
  /** Closes the open project. */
  closeProject(): Promise<void>;

  /** The open project's latest build, or null before the first. */
  lastBuild(): Promise<BuildResult | null>;
  /** Calls `listener` after every build of the open project; returns the unsubscribe. */
  onBuild(listener: (result: BuildResult) => void): () => void;

  /** The motions the open project holds. */
  projectMotions(): Promise<ProjectMotion[]>;
  /** The catalogue's motions that contain every word ('' for all). */
  searchMotions(words: string): Promise<CatalogueMotion[]>;
  /** Takes a motion from the catalogue into the open project. */
  useMotion(id: string): Promise<ProjectMotion>;
  /** What a motion the open project holds says and has. */
  motionDetail(id: string): Promise<MotionDetail>;
  motionReel(id: string): Promise<string | null>;

  /** The model providers and which one is active. */
  providers(): Promise<Providers>;
  /** The open project's agent and the coding agents this machine has. */
  agents(): Promise<Agents>;
  /** Makes the open project talk to this agent from its next message. */
  useAgent(kind: AgentKind): Promise<Agents>;
  saveProvider(input: ProviderInput): Promise<Providers>;
  removeProvider(id: string): Promise<Providers>;
  activateProvider(id: string): Promise<Providers>;
  /** Calls the model as the form describes it, once, asking it to call a tool. Uses the stored key when none is typed. */
  testProvider(input: ProviderInput): Promise<ProviderTest>;

  /** The open project's conversation with the agent. */
  conversation(): Promise<ChatItem[]>;
  /** Sends a message, with the places marked on the picture, to the agent; resolves when its turn ends. */
  sendMessage(text: string, marks: Mark[], refs: Reference[], version: number): Promise<{ ok: boolean }>;
  /** Stops the agent's turn. */
  stopAgent(): Promise<void>;
  /** Forgets the open project's conversation. */
  clearConversation(): Promise<void>;
  /** Calls `listener` with what the agent does; returns the unsubscribe. */
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;

  /** Asks where to save, then exports the film as an MP4; the path, or null when the person cancels. */
  exportFilm(): Promise<string | null>;
  /** Calls `listener` with the running export's progress (0 to 1); returns the unsubscribe. */
  onExportProgress(listener: (done: number) => void): () => void;
  /** Stops the running export, if any. */
  cancelExport(): Promise<void>;
  /** Asks for an empty (or new) folder, then writes the film there as a Remotion project; the folder, or null when the person cancels. */
  exportRemotion(): Promise<string | null>;
  /** Shows the last exported file or folder in the system's file manager. */
  showExported(): Promise<void>;
}

/** Invoked channels, one per request method of StudioApi. */
export const CHANNELS = {
  examples: 'examples:list',
  openExample: 'examples:open',
  projectAssets: 'assets:list',
  importAssets: 'assets:import',
  reviewFilm: 'film:review',
  history: 'project:history',
  restoreCheckpoint: 'project:restore',
  undoTurn: 'agent:undo-turn',
  recentProjects: 'project:recent',
  openProject: 'project:open',
  createProject: 'project:create',
  openRecent: 'project:open-recent',
  startFilm: 'project:start-film',
  closeProject: 'project:close',
  lastBuild: 'film:last-build',
  projectMotions: 'motions:project',
  searchMotions: 'motions:search',
  useMotion: 'motions:use',
  motionDetail: 'motions:detail',
  motionReel: 'motions:reel',
  providers: 'providers:list',
  agents: 'agent:agents',
  useAgent: 'agent:use',
  saveProvider: 'providers:save',
  removeProvider: 'providers:remove',
  activateProvider: 'providers:activate',
  testProvider: 'providers:test',
  conversation: 'agent:conversation',
  sendMessage: 'agent:send',
  stopAgent: 'agent:stop',
  clearConversation: 'agent:clear',
  exportFilm: 'film:export',
  cancelExport: 'film:cancel-export',
  exportRemotion: 'film:export-remotion',
  showExported: 'film:show-exported',
} as const;

/** Events the main process sends. */
export const EVENTS = {
  build: 'film:built',
  exportProgress: 'film:export-progress',
  agent: 'agent:event',
} as const;
