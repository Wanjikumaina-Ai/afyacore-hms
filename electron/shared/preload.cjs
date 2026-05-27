'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// ── Shared bridge (works for both server app and client app) ──
contextBridge.exposeInMainWorld('afyacore', {
  // ── App info ──────────────────────────────────────────────
  getVersion:   () => ipcRenderer.invoke('app:getVersion'),
  getName:      () => ipcRenderer.invoke('app:getName'),
  isElectron:   true,
  platform:     process.platform,

  // ── Window controls ───────────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  hide:     () => ipcRenderer.invoke('window:hide'),
  close:    () => ipcRenderer.invoke('window:close'),

  // ── SERVER mode only ──────────────────────────────────────
  server: {
    getInfo:       () => ipcRenderer.invoke('server:info'),
    getConfig:     () => ipcRenderer.invoke('server:getConfig'),
    isSetupDone:   () => ipcRenderer.invoke('server:isSetupDone'),
    completeSetup: (data) => ipcRenderer.invoke('setup:complete', data),
    registerService: () => ipcRenderer.invoke('service:register'),
    openLogs:      () => ipcRenderer.invoke('app:openLogs'),
  },

  // ── CLIENT mode only ─────────────────────────────────────
  client: {
    getConfig:       () => ipcRenderer.invoke('client:getConfig'),
    testConnection:  (host, port) => ipcRenderer.invoke('client:testConnection', { host, port }),
    connectToServer: (data) => ipcRenderer.invoke('client:connectToServer', data),
    testCurrent:     () => ipcRenderer.invoke('client:testCurrentServer'),
    resetServer:     () => ipcRenderer.invoke('client:resetServer'),
  },

  // ── License ───────────────────────────────────────────────
  license: {
    getFingerprint: () => ipcRenderer.invoke('license:getFingerprint'),
    activate:       (key) => ipcRenderer.invoke('license:activate', key),
    getStatus:      () => ipcRenderer.invoke('license:status'),
  },

  // ── Backup ───────────────────────────────────────────────
  backup: {
    create:  () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
  },

  // ── File dialogs ─────────────────────────────────────────
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
});
