// The bridge: exposes StudioApi to the sandboxed renderer as `window.studio`, and
// nothing else (no ipcRenderer, no Node).

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CHANNELS, EVENTS, type StudioApi } from '../shared/api';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: StudioApi = {
  recentProjects: () => ipcRenderer.invoke(CHANNELS.recentProjects),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  createProject: () => ipcRenderer.invoke(CHANNELS.createProject),
  openRecent: (path) => ipcRenderer.invoke(CHANNELS.openRecent, path),
  startFilm: () => ipcRenderer.invoke(CHANNELS.startFilm),
  closeProject: () => ipcRenderer.invoke(CHANNELS.closeProject),
  lastBuild: () => ipcRenderer.invoke(CHANNELS.lastBuild),
  onBuild: (listener) => subscribe(EVENTS.build, listener),
  exportFilm: () => ipcRenderer.invoke(CHANNELS.exportFilm),
  onExportProgress: (listener) => subscribe(EVENTS.exportProgress, listener),
  cancelExport: () => ipcRenderer.invoke(CHANNELS.cancelExport),
};

contextBridge.exposeInMainWorld('studio', api);
