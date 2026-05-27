'use strict';
// ============================================================
// AfyaCore HMS - CLIENT MAIN PROCESS
// Lightweight shell installed on every staff PC
// On first run: asks for server IP
// After config: connects to hospital server on LAN
// No database, no license needed here
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const http = require('node:http');

// ── Constants ─────────────────────────────────────────────────
const IS_DEV      = process.env.NODE_ENV === 'development';
const APP_NAME    = 'AfyaCore HMS';
const CONFIG_FILE = path.join(app.getPath('userData'), 'client.config.json');
const LOG_DIR     = path.join(app.getPath('userData'), 'logs');

// ── Global state ──────────────────────────────────────────────
let mainWindow = null;

// ── Prevent multiple instances ────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) { mainWindow.isMinimized() && mainWindow.restore(); mainWindow.focus(); }
});

// ── Ensure dirs ───────────────────────────────────────────────
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Config helpers ────────────────────────────────────────────
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return {};
}

function writeConfig(data) {
  const current = readConfig();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...data }, null, 2));
}

function getServerUrl() {
  const config = readConfig();
  if (!config.serverHost) return null;
  const port = config.serverPort || 8080;
  return `http://${config.serverHost}:${port}`;
}

// ── Test connection to server ─────────────────────────────────
function testConnection(host, port) {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/api/system/health`, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: true, status: json.status, version: json.version });
        } catch {
          resolve({ ok: res.statusCode === 200, status: 'unknown' });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
  });
}

// ── Create window ─────────────────────────────────────────────
function createWindow() {
  const config    = readConfig();
  const hasServer = !!(config.serverHost);
  const serverUrl = getServerUrl();

  mainWindow = new BrowserWindow({
    width:    hasServer ? 1400 : 560,
    height:   hasServer ? 880  : 620,
    minWidth: hasServer ? 1024 : 520,
    minHeight:hasServer ? 680  : 560,
    title: APP_NAME,
    icon: path.join(__dirname, '../../build/client/icon.ico'),
    backgroundColor: '#0f172a',
    resizable: hasServer,
    show: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, '../shared/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV && hasServer) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!hasServer) {
    // First-run: load the connect-to-server setup page
    if (IS_DEV) {
      mainWindow.loadURL('http://localhost:5174'); // client dev server
    } else {
      mainWindow.loadFile(path.join(__dirname, '../../dist-client/index.html'));
    }
  } else {
    // Load the server UI directly via LAN
    mainWindow.loadURL(`${serverUrl}/`);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────
function setupIPC() {
  // Test connection before saving
  ipcMain.handle('client:testConnection', async (_, { host, port }) => {
    const result = await testConnection(host, port || 8080);
    return result;
  });

  // Save server config and reload as full window
  ipcMain.handle('client:connectToServer', async (_, { host, port, nickname }) => {
    try {
      const p = port || 8080;
      const test = await testConnection(host, p);
      if (!test.ok) {
        return { success: false, error: `Cannot reach server at ${host}:${p} — ${test.error || 'no response'}` };
      }
      writeConfig({ serverHost: host, serverPort: p, serverNickname: nickname || host, connectedAt: new Date().toISOString() });
      // Reload as full window
      mainWindow.setSize(1400, 880);
      mainWindow.setMinimumSize(1024, 680);
      mainWindow.setResizable(true);
      mainWindow.center();
      mainWindow.loadURL(`http://${host}:${p}/`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Forget server (reset to setup screen)
  ipcMain.handle('client:resetServer', () => {
    writeConfig({ serverHost: null, serverPort: null });
    mainWindow.setSize(560, 620);
    mainWindow.setResizable(false);
    mainWindow.center();
    if (IS_DEV) mainWindow.loadURL('http://localhost:5174');
    else mainWindow.loadFile(path.join(__dirname, '../../dist-client/index.html'));
    return { success: true };
  });

  ipcMain.handle('client:getConfig', () => readConfig());

  ipcMain.handle('client:testCurrentServer', async () => {
    const config = readConfig();
    if (!config.serverHost) return { ok: false, error: 'No server configured' };
    return testConnection(config.serverHost, config.serverPort || 8080);
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getName',    () => APP_NAME);

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle('window:close',    () => mainWindow?.close());
}

// ── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
