const { contextBridge, ipcRenderer } = require('electron');

// ─── Secure IPC bridge exposed to renderer ────────────────────────────────────
// Only whitelisted channels are exposed. Nothing else.
contextBridge.exposeInMainWorld('afyacore', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // File dialogs
  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // Backup & restore
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  // Print
  printPage: (opts) => ipcRenderer.invoke('print:page', opts),

  // License
  getHardwareFingerprint: () => ipcRenderer.invoke('license:getFingerprint'),

  // Environment
  isDev: process.env.NODE_ENV === 'development',
  isElectron: true,
});
