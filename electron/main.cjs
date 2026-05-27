const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('node:path');
const { serve } = require('@hono/node-server');

let mainWindow = null;
let tray = null;
let localServer = null;

// ─── App config ───────────────────────────────────────────────────────────────
const APP_PORT = 8080;
const WS_PORT = 8081;
const IS_DEV = process.env.NODE_ENV === 'development';
const VITE_DEV_URL = 'http://localhost:5173';

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Create window ────────────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AfyaCore HMS',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    show: false, // Show after ready-to-show
  });

  // Security headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "connect-src 'self' ws://localhost:8081 http://localhost:8080; " +
          "img-src 'self' data: blob:;"
        ],
      },
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load app
  if (IS_DEV) {
    await mainWindow.loadURL(VITE_DEV_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ─── Local API server ─────────────────────────────────────────────────────────
async function startLocalServer() {
  try {
    // Dynamic import for ESM Hono module
    const { apiRouter } = await import('../src/server/routes/api.js');
    const { db } = await import('../src/lib/db/database.js');
    const { wsServer } = await import('../src/server/websocket/ws-server.js');
    const { licenseService } = await import('../src/lib/license/license-service.js');

    // Initialize DB
    await db.initialize();

    // Validate license at startup
    const licStatus = licenseService.validateLicense();
    if (!licStatus.valid) {
      console.warn('[AfyaCore] License invalid or not activated:', licStatus.error);
    }

    // Start WS server
    wsServer.init(WS_PORT);

    // Start HTTP server
    localServer = serve({ fetch: apiRouter.fetch, port: APP_PORT }, () => {
      console.log(`[AfyaCore] Local API server running on http://localhost:${APP_PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    console.error('[AfyaCore] Failed to start local server:', err);
    dialog.showErrorBox('Startup Error', `AfyaCore failed to start: ${err.message}`);
    app.quit();
  }
}

function shutdown() {
  console.log('[AfyaCore] Shutting down...');
  try {
    const { db } = require('../src/lib/db/database.js');
    db.flush();
    db.close();
  } catch { /* ignore */ }
  localServer?.close();
  app.quit();
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../public/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'AfyaCore HMS', enabled: false },
    { type: 'separator' },
    { label: 'Open', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Minimize to Tray', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit AfyaCore', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('AfyaCore HMS');
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIpcHandlers() {
  // File dialogs
  ipcMain.handle('dialog:openFile', async (_, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async (_, { defaultName, filters }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));
  ipcMain.handle('app:getPlatform', () => process.platform);

  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  // Backup via dialog
  ipcMain.handle('backup:create', async () => {
    const folderPath = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select backup location',
    });
    if (folderPath.canceled) return { success: false, error: 'Cancelled' };
    try {
      const { db } = require('../src/lib/db/database.js');
      db.backup(folderPath.filePaths[0]);
      return { success: true, path: folderPath.filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restore', async () => {
    const filePath = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Select backup file',
      filters: [{ name: 'AfyaCore DB', extensions: ['db'] }],
    });
    if (filePath.canceled) return { success: false, error: 'Cancelled' };
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Confirm Restore',
      message: 'Restoring will overwrite all current data. This cannot be undone. Continue?',
      buttons: ['Cancel', 'Restore'],
      defaultId: 0,
    });
    if (confirm.response === 0) return { success: false, error: 'Cancelled' };
    try {
      const { db } = require('../src/lib/db/database.js');
      db.restore(filePath.filePaths[0]);
      mainWindow?.webContents.reload();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Print
  ipcMain.handle('print:page', async (_, options) => {
    const win = mainWindow;
    return new Promise((resolve) => {
      win?.webContents.print(
        { silent: false, printBackground: true, ...options },
        (success, errorType) => resolve({ success, errorType }),
      );
    });
  });

  // Hardware fingerprint (for licensing)
  ipcMain.handle('license:getFingerprint', async () => {
    const { licenseService } = require('../src/lib/license/license-service.js');
    return licenseService.getHardwareFingerprint();
  });
}

// ─── App events ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startLocalServer();
  setupIpcHandlers();
  createTray();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS keep running in tray; on Windows/Linux quit
  if (process.platform !== 'darwin') {
    shutdown();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
