// The one surface the renderer reaches the main process through. The preload script
// implements it with ipcRenderer.invoke on the channels below; the main process
// registers a handler for each and validates whatever the renderer sends.

export interface Project {
  /** The folder's name, as the Studio shows it. */
  name: string;
  /** The absolute path of the folder. */
  path: string;
}

export interface StudioApi {
  /** Recent projects, most recent first, without folders that no longer exist. */
  recentProjects(): Promise<Project[]>;
  /** Asks for a folder and opens it; null when the person cancels. */
  openProject(): Promise<Project | null>;
  /** Asks for an empty (or new) folder and makes it a project; null when the person cancels. */
  createProject(): Promise<Project | null>;
  /** Opens a folder from the recent list; any other path is refused. */
  openRecent(path: string): Promise<Project>;
}

export const CHANNELS = {
  recentProjects: 'project:recent',
  openProject: 'project:open',
  createProject: 'project:create',
  openRecent: 'project:open-recent',
} as const satisfies Record<keyof StudioApi, string>;
