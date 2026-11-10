// The bridge: exposes StudioApi to the sandboxed renderer as `window.studio`, and
// nothing else (no ipcRenderer, no Node).

import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type StudioApi } from '../shared/api';

const api: StudioApi = {
  recentProjects: () => ipcRenderer.invoke(CHANNELS.recentProjects),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  createProject: () => ipcRenderer.invoke(CHANNELS.createProject),
  openRecent: (path) => ipcRenderer.invoke(CHANNELS.openRecent, path),
};

contextBridge.exposeInMainWorld('studio', api);
