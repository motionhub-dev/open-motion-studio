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

/** A place the person marked on the picture, sent with their next message. */
export interface Mark {
  /** Seconds into the film. */
  t: number;
  /** The marked box, in fractions of the frame. */
  box: Box;
  /** The element picked there, or null for a region dragged out. */
  element: PickedElement | null;
}

/** The most marks one message may carry. */
export const MAX_MARKS = 5;

/** What a connection test found. */
export type ProviderTest = { ok: true; ms: number; calledTool: boolean } | { ok: false; error: string };

/** One entry of the conversation, as the assistant panel shows it. */
export type ChatItem =
  | { kind: 'user'; text: string; marks: number }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; at?: number; result?: { ok: boolean; text: string; image?: string } }
  | { kind: 'notice'; text: string; error: boolean };

/** What the agent reports while it works. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; summary: string; at?: number }
  | { type: 'tool-result'; id: string; ok: boolean; text: string; image?: string }
  | { type: 'end'; notice?: { text: string; error: boolean } };

export interface StudioApi {
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

  /** The model providers and which one is active. */
  providers(): Promise<Providers>;
  saveProvider(input: ProviderInput): Promise<Providers>;
  removeProvider(id: string): Promise<Providers>;
  activateProvider(id: string): Promise<Providers>;
  /** Calls the model as the form describes it, once, asking it to call a tool. Uses the stored key when none is typed. */
  testProvider(input: ProviderInput): Promise<ProviderTest>;

  /** The open project's conversation with the agent. */
  conversation(): Promise<ChatItem[]>;
  /** Sends a message, with the places marked on the picture, to the agent; resolves when its turn ends. */
  sendMessage(text: string, marks: Mark[]): Promise<void>;
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
  providers: 'providers:list',
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
