// The one surface the renderer reaches the main process through. The preload script
// implements it with ipcRenderer on the channels below; the main process registers a
// handler for each and validates whatever the renderer sends.

export type Engine = 'native';

export interface Project {
  /** The folder's name, as the Studio shows it. */
  name: string;
  /** The absolute path of the folder. */
  path: string;
  /** The engine its film is written for, or null for a folder that holds no film yet. */
  engine: Engine | null;
}

/** The film's bundle, rebuilt whenever a file it imports changes. */
export interface BuildResult {
  ok: boolean;
  /** Counts builds, so a page can ask for the bundle it was told about. */
  version: number;
  /** The bundler's errors, formatted as it prints them. */
  errors: string[];
}

export interface StudioApi {
  /** Recent projects, most recent first, without folders that no longer exist. */
  recentProjects(): Promise<Project[]>;
  /** Asks for a folder and opens it; null when the person cancels. */
  openProject(): Promise<Project | null>;
  /** Asks for an empty (or new) folder and makes it a native project; null when the person cancels. */
  createProject(): Promise<Project | null>;
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
  exportFilm: 'film:export',
  cancelExport: 'film:cancel-export',
} as const;

/** Events the main process sends. */
export const EVENTS = {
  build: 'film:built',
  exportProgress: 'film:export-progress',
} as const;
