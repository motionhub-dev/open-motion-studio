// The one surface the renderer reaches the main process through. The preload script
// implements it with ipcRenderer on the channels below; the main process registers a
// handler for each and validates whatever the renderer sends.

/** The engines a film can be written for. */
export type EngineId = 'native' | 'remotion';

export interface Project {
  /** The folder's name, as the Studio shows it. */
  name: string;
  /** The absolute path of the folder. */
  path: string;
  /** The engine its film is written for, or null for a folder that holds no film yet. */
  engine: EngineId | null;
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

/** One entry of the conversation, as the assistant panel shows it. */
export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; result?: { ok: boolean; text: string; image?: string } }
  | { kind: 'notice'; text: string; error: boolean };

/** What the agent reports while it works. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; summary: string }
  | { type: 'tool-result'; id: string; ok: boolean; text: string; image?: string }
  | { type: 'end'; notice?: { text: string; error: boolean } };

export interface StudioApi {
  /** Recent projects, most recent first, without folders that no longer exist. */
  recentProjects(): Promise<Project[]>;
  /** Asks for a folder and opens it; null when the person cancels. */
  openProject(): Promise<Project | null>;
  /** Asks for an empty (or new) folder and makes it a project for `engine`; null when the person cancels. */
  createProject(engine: EngineId): Promise<Project | null>;
  /** Calls `listener` with each step of making a project (Remotion's install); returns the unsubscribe. */
  onCreateProgress(listener: (line: string) => void): () => void;
  /** Opens a folder from the recent list; any other path is refused. */
  openRecent(path: string): Promise<Project>;
  /** Starts a native film in the open project, which holds none yet. */
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

  /** The model providers and which one is active. */
  providers(): Promise<Providers>;
  saveProvider(input: ProviderInput): Promise<Providers>;
  removeProvider(id: string): Promise<Providers>;
  activateProvider(id: string): Promise<Providers>;

  /** The open project's conversation with the agent. */
  conversation(): Promise<ChatItem[]>;
  /** Sends a message to the agent; resolves when its turn ends. */
  sendMessage(text: string): Promise<void>;
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
  providers: 'providers:list',
  saveProvider: 'providers:save',
  removeProvider: 'providers:remove',
  activateProvider: 'providers:activate',
  conversation: 'agent:conversation',
  sendMessage: 'agent:send',
  stopAgent: 'agent:stop',
  clearConversation: 'agent:clear',
  exportFilm: 'film:export',
  cancelExport: 'film:cancel-export',
} as const;

/** Events the main process sends. */
export const EVENTS = {
  build: 'film:built',
  exportProgress: 'film:export-progress',
  agent: 'agent:event',
  createProgress: 'project:create-progress',
} as const;
