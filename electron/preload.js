'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('pf', {
  boot: () => ipcRenderer.invoke('boot'),
  getState: () => ipcRenderer.invoke('state:get'),
  patchConfig: (patch) => ipcRenderer.invoke('config:patch', patch),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  pollNow: () => ipcRenderer.invoke('poll:now'),
  setPaused: (p) => ipcRenderer.invoke('poll:pause', p),
  getDetail: (id) => ipcRenderer.invoke('detail:get', id),
  testNotify: () => ipcRenderer.invoke('notify:test'),
  pickSound: () => ipcRenderer.invoke('sound:pick'),
  getSound: () => ipcRenderer.invoke('sound:get'),
  clearSound: () => ipcRenderer.invoke('sound:clear'),
  testSource: (src) => ipcRenderer.invoke('source:test', src),
  closeDecision: (payload) => ipcRenderer.invoke('window:close-decision', payload),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  clearHits: () => ipcRenderer.invoke('hits:clear'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  onState: on('state'),
  onConfig: on('config'),
  onPlayAlert: on('play-alert'),
  onFocusListing: on('focus-listing'),
  onRequestClose: on('request-close'),
});
