'use strict';
// ============================================================
// AfyaCore HMS - SERVER MAIN PROCESS
// Runs on the hospital's dedicated server PC
// Hosts: database, API (port 8080), WebSocket (port 8081)
// Registers as a Windows service for auto-start on boot
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const http   = require('node:http');
const { execSync, exec } = require('node:child_process');

// ── Constants ─────────────────────────────────────────────────
const IS_DEV     = process.env.NODE_ENV === 'development';
const APP_PORT   = 8080;
const WS_PORT    = 8081;
const APP_NAME   = 'AfyaCore HMS Server';
const SERVICE_ID = 'AfyaCoreHMSServer';
const DATA_DIR   = path.join(app.getPath('userData'), 'data');
const LOG_DIR    = path.join(app.getPath('userData'), 'logs');
const CONFIG_FILE = path.join(app.getPath('userData'), 'server.config.json');

// ── Global state ──────────────────────────────────────────────
let mainWindow   = null;
let tray         = null;
let localServer  = null;
let wsServerInst = null;
let isSetupDone  = false;

// ── Prevent multiple instances ────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) { mainWindow.isMinimized() && mainWindow.restore(); mainWindow.focus(); }
});

// ── Ensure directories ────────────────────────────────────────
[DATA_DIR, LOG_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Logger ────────────────────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try {
    const file = path.join(LOG_DIR, `server-${new Date().toISOString().slice(0,10)}.log`);
    fs.appendFileSync(file, line);
  } catch {}
}

// ── Read server config ────────────────────────────────────────
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

// ── Check if setup is complete ────────────────────────────────
function checkSetupComplete() {
  const config = readConfig();
  return !!(config.setupComplete && config.hospitalName && config.licenseActivated);
}

// ── Start the API server ──────────────────────────────────────
async function startApiServer() {
  try {
    const { db }           = await import('../../src/lib/db/database.js');
    const { apiRouter }    = await import('../../src/server/routes/api.js');
    const { wsServer }     = await import('../../src/server/websocket/ws-server.js');
    const { serve }        = await import('@hono/node-server');
    const { seedPermissions, createDefaultSuperAdmin } = await import('../../src/lib/auth/rbac-seeder.js');

    // Init DB
    await db.initialize(DATA_DIR);
    log('INFO', 'Database initialized at ' + DATA_DIR);

    // Seed RBAC on first run
    const config = readConfig();
    if (!config.rbacSeeded) {
      seedPermissions();
      await createDefaultSuperAdmin();
      writeConfig({ rbacSeeded: true });
      log('INFO', 'RBAC seeded, default admin created');
    }

    // Start WebSocket server
    wsServer.init(WS_PORT);
    wsServerInst = wsServer;
    log('INFO', `WebSocket server on port ${WS_PORT}`);

    // Start HTTP server
    localServer = serve({ fetch: apiRouter.fetch, port: APP_PORT, hostname: '0.0.0.0' }, () => {
      log('INFO', `API server on http://0.0.0.0:${APP_PORT}`);
    });

    return true;
  } catch (err) {
    log('ERROR', 'Failed to start API server: ' + err.message);
    throw err;
  }
}

// ── Get local IP ──────────────────────────────────────────────
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of (iface || [])) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// ── Create main window ────────────────────────────────────────
function createWindow(startPath) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    title: APP_NAME,
    icon: path.join(__dirname, '../../build/server/icon.ico'),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !IS_DEV,
    },
  });

  // Security headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:${WS_PORT} http://localhost:${APP_PORT};`
        ],
      },
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (IS_DEV) {
    mainWindow.loadURL(`http://localhost:5173${startPath}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      hash: startPath,
    });
  }
}

// ── System Tray ───────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../../build/server/tray.ico');
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(img);

  const buildMenu = () => Menu.buildFromTemplate([
    { label: APP_NAME, enabled: false },
    { label: `Server IP: ${getLocalIP()}:${APP_PORT}`, enabled: false },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'View Logs', click: () => shell.openPath(LOG_DIR) },
    { type: 'separator' },
    {
      label: 'Register as Windows Service', click: () => registerWindowsService(),
      enabled: process.platform === 'win32',
    },
    { type: 'separator' },
    { label: 'Quit AfyaCore Server', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(buildMenu());
  tray.setToolTip(`${APP_NAME} — ${getLocalIP()}:${APP_PORT}`);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── Windows Service Registration ──────────────────────────────
function registerWindowsService() {
  if (process.platform !== 'win32') return;
  try {
    const exePath = process.execPath;
    // Use sc.exe to register as a service
    execSync(`sc create "${SERVICE_ID}" binPath= "${exePath} --service" start= auto DisplayName= "${APP_NAME}"`, { stdio: 'pipe' });
    execSync(`sc description "${SERVICE_ID}" "AfyaCore Hospital Management System Server"`, { stdio: 'pipe' });
    execSync(`sc start "${SERVICE_ID}"`, { stdio: 'pipe' });
    log('INFO', 'Windows service registered and started');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Service Registered',
      message: `AfyaCore Server registered as a Windows service.\n\nIt will now start automatically when Windows boots — even without anyone logging in.\n\nService name: ${SERVICE_ID}`,
    });
  } catch (err) {
    log('ERROR', 'Service registration failed: ' + err.message);
    dialog.showErrorBox('Service Registration Failed',
      `Could not register Windows service.\n\nRun PowerShell as Administrator and try again.\n\nError: ${err.message}`
    );
  }
}

// ── IPC Handlers ──────────────────────────────────────────────
function setupIPC() {
  // Setup wizard completion
  ipcMain.handle('setup:complete', async (_, data) => {
    try {
      writeConfig({
        setupComplete: true,
        hospitalName: data.hospitalName,
        licenseKey: data.licenseKey,
        licenseActivated: data.licenseActivated,
        adminCreated: true,
        serverIP: getLocalIP(),
        setupDate: new Date().toISOString(),
      });
      isSetupDone = true;
      log('INFO', `Setup complete for hospital: ${data.hospitalName}`);
      // Reload to dashboard
      setTimeout(() => {
        if (IS_DEV) mainWindow.loadURL('http://localhost:5173/#/dashboard');
        else mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/dashboard' });
      }, 500);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('server:info', () => ({
    ip: getLocalIP(),
    port: APP_PORT,
    wsPort: WS_PORT,
    dataDir: DATA_DIR,
    version: app.getVersion(),
    platform: process.platform,
    hostname: os.hostname(),
    uptime: process.uptime(),
  }));

  ipcMain.handle('server:getConfig', () => readConfig());

  ipcMain.handle('server:isSetupDone', () => checkSetupComplete());

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('backup:create', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select backup destination folder',
    });
    if (result.canceled) return { success: false, error: 'Cancelled' };
    try {
      const { db } = await import('../../src/lib/db/database.js');
      db.backup(result.filePaths[0]);
      return { success: true, path: result.filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restore', async () => {
    const pick = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'AfyaCore Database', extensions: ['db'] }],
      title: 'Select backup file to restore',
    });
    if (pick.canceled) return { success: false, error: 'Cancelled' };
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Confirm Restore',
      message: 'This will overwrite ALL current data. This cannot be undone. Continue?',
      buttons: ['Cancel', 'Yes, Restore'],
      defaultId: 0,
    });
    if (confirm.response === 0) return { success: false, error: 'Cancelled' };
    try {
      const { db } = await import('../../src/lib/db/database.js');
      db.restore(pick.filePaths[0]);
      mainWindow.webContents.reload();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('service:register', () => { registerWindowsService(); return { success: true }; });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:openLogs',   () => shell.openPath(LOG_DIR));
  ipcMain.handle('license:getFingerprint', async () => {
    const { licenseService } = await import('../../src/lib/license/license-service.js');
    return licenseService.getHardwareFingerprint();
  });
  ipcMain.handle('license:activate', async (_, key) => {
    const { licenseService } = await import('../../src/lib/license/license-service.js');
    return licenseService.activateLicense(key);
  });
  ipcMain.handle('license:status', async () => {
    const { licenseService } = await import('../../src/lib/license/license-service.js');
    return licenseService.validateLicense();
  });

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle('window:hide',     () => mainWindow?.hide());
}

// ── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  log('INFO', `Starting ${APP_NAME} v${app.getVersion()}`);

  try {
    await startApiServer();
  } catch (err) {
    dialog.showErrorBox('Startup Failed', `AfyaCore Server failed to start:\n\n${err.message}`);
    app.quit();
    return;
  }

  setupIPC();
  createTray();

  isSetupDone = checkSetupComplete();
  const startPath = isSetupDone ? '/#/dashboard' : '/#/setup';
  createWindow(startPath);

  log('INFO', `Server IP: ${getLocalIP()}:${APP_PORT}`);
  log('INFO', `Setup complete: ${isSetupDone}`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(isSetupDone ? '/#/dashboard' : '/#/setup');
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms for server mode
  // Only quit when explicitly told to
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  log('INFO', 'Shutting down server...');
  try {
    localServer?.close();
    wsServerInst?.close();
    const { db } = await import('../../src/lib/db/database.js');
    db.flush();
    db.close();
  } catch {}
  log('INFO', 'Server shut down cleanly');
});

process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught exception: ' + err.message + '\n' + err.stack);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'Unhandled rejection: ' + String(reason));
});
