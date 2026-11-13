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
  examples: () => ipcRenderer.invoke(CHANNELS.examples),
  openExample: (id) => ipcRenderer.invoke(CHANNELS.openExample, id),
  projectAssets: () => ipcRenderer.invoke(CHANNELS.projectAssets),
  importAssets: () => ipcRenderer.invoke(CHANNELS.importAssets),
  reviewFilm: () => ipcRenderer.invoke(CHANNELS.reviewFilm),
  history: () => ipcRenderer.invoke(CHANNELS.history),
  restoreCheckpoint: (id) => ipcRenderer.invoke(CHANNELS.restoreCheckpoint, id),
  agents: () => ipcRenderer.invoke(CHANNELS.agents),
  useAgent: (kind) => ipcRenderer.invoke(CHANNELS.useAgent, kind),
  answerApproval: (id, answer) => ipcRenderer.invoke(CHANNELS.answerApproval, id, answer),
  signInAgent: (kind) => ipcRenderer.invoke(CHANNELS.signInAgent, kind),
  undoTurn: (checkpoint) => ipcRenderer.invoke(CHANNELS.undoTurn, checkpoint),
  recentProjects: () => ipcRenderer.invoke(CHANNELS.recentProjects),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  createProject: () => ipcRenderer.invoke(CHANNELS.createProject),
  openRecent: (path) => ipcRenderer.invoke(CHANNELS.openRecent, path),
  startFilm: () => ipcRenderer.invoke(CHANNELS.startFilm),
  closeProject: () => ipcRenderer.invoke(CHANNELS.closeProject),
  lastBuild: () => ipcRenderer.invoke(CHANNELS.lastBuild),
  onBuild: (listener) => subscribe(EVENTS.build, listener),
  projectMotions: () => ipcRenderer.invoke(CHANNELS.projectMotions),
  searchMotions: (words) => ipcRenderer.invoke(CHANNELS.searchMotions, words),
  useMotion: (id) => ipcRenderer.invoke(CHANNELS.useMotion, id),
  motionReel: (id) => ipcRenderer.invoke(CHANNELS.motionReel, id),
  motionDetail: (id) => ipcRenderer.invoke(CHANNELS.motionDetail, id),
  providers: () => ipcRenderer.invoke(CHANNELS.providers),
  saveProvider: (input) => ipcRenderer.invoke(CHANNELS.saveProvider, input),
  removeProvider: (id) => ipcRenderer.invoke(CHANNELS.removeProvider, id),
  activateProvider: (id) => ipcRenderer.invoke(CHANNELS.activateProvider, id),
  testProvider: (input) => ipcRenderer.invoke(CHANNELS.testProvider, input),
  conversation: () => ipcRenderer.invoke(CHANNELS.conversation),
  sendMessage: (text, marks, refs, version) => ipcRenderer.invoke(CHANNELS.sendMessage, text, marks, refs, version),
  stopAgent: () => ipcRenderer.invoke(CHANNELS.stopAgent),
  clearConversation: () => ipcRenderer.invoke(CHANNELS.clearConversation),
  onAgentEvent: (listener) => subscribe(EVENTS.agent, listener),
  exportFilm: () => ipcRenderer.invoke(CHANNELS.exportFilm),
  onExportProgress: (listener) => subscribe(EVENTS.exportProgress, listener),
  cancelExport: () => ipcRenderer.invoke(CHANNELS.cancelExport),
  exportRemotion: () => ipcRenderer.invoke(CHANNELS.exportRemotion),
  showExported: () => ipcRenderer.invoke(CHANNELS.showExported),
};

contextBridge.exposeInMainWorld('studio', api);
