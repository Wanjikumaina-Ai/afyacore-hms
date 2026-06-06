const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, session } = require('electron');
const path = require('node:path');
const { serve } = require('@hono/node-server');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let localServer = null;

const APP_PORT = 8080;
const WS_PORT = 8081;
const IS_DEV = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// In dev, Vite runs on 5173 and proxies /api → 8080.
// In production, Electron serves everything from 8080.
const VITE_PORT = process.env.ELECTRON_DEV_VITE_PORT || '5173';
const APP_URL = IS_DEV ? `http://localhost:${VITE_PORT}` : `http://localhost:${APP_PORT}`;

console.log('[AfyaCore] Electron app starting...');
console.log('[AfyaCore] Development mode:', IS_DEV);
console.log('[AfyaCore] Loading URL:', APP_URL);
console.log('[AfyaCore] Node version:', process.version);
console.log('[AfyaCore] Electron version:', process.versions.electron);

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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AfyaCore HMS',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    show: false,
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "connect-src 'self' ws://localhost:* http://localhost:*; " +
          "img-src 'self' data: blob:;"
        ],
      },
    });
  });

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Origin'] = 'http://localhost:8080';
    details.requestHeaders['Access-Control-Allow-Origin'] = '*';
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Open DevTools automatically in dev mode
    if (IS_DEV) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(APP_URL);
}

async function startLocalServer() {
  try {
    console.log('[AfyaCore] Starting local server on port', APP_PORT, '...');
    
    const { apiRouter } = await import('../dist-server/server/routes/api.js');
    const { db } = await import('../dist-server/lib/db/database.js');
    const { wsServer } = await import('../dist-server/server/websocket/ws-server.js');
    const { licenseService } = await import('../dist-server/lib/license/license-service.js');

    await db.initialize();

    const licStatus = licenseService.validateLicense();
    if (!licStatus.valid) {
      console.warn('[AfyaCore] License invalid or not activated:', licStatus.error);
    }

    wsServer.init(WS_PORT);

    const clientPath = path.join(__dirname, '../build/client');
    const indexPath = path.join(clientPath, 'index.html');

    // Create a wrapper fetch handler that combines static files and API routes.
    // In dev mode the static-file branch is never reached because the window
    // loads from Vite (port 5173). In production it serves build/client.
    const fetch = async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Serve static assets and index.html from build/client (production only)
      if (!IS_DEV && (pathname.startsWith('/assets/') || pathname === '/' || !pathname.includes('.'))) {
        try {
          let filePath = pathname === '/' ? indexPath : path.join(clientPath, pathname);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath);
            const ext = path.extname(filePath);
            const mimeType = {
              '.html': 'text/html',
              '.js': 'application/javascript',
              '.css': 'text/css',
              '.json': 'application/json',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.svg': 'image/svg+xml',
              '.woff': 'font/woff',
              '.woff2': 'font/woff2',
            }[ext] || 'application/octet-stream';
            return new Response(content, { headers: { 'Content-Type': mimeType } });
          }
        } catch (e) {
          // Fall through to index.html for SPA routing
          try {
            const content = fs.readFileSync(indexPath);
            return new Response(content, { headers: { 'Content-Type': 'text/html' } });
          } catch {
            return new Response('Not Found', { status: 404 });
          }
        }
      }

      // Route everything else through the API router
      return apiRouter.fetch(req);
    };

    localServer = serve({ fetch, port: APP_PORT }, () => {
      console.log(`[AfyaCore] Local API server running on http://localhost:${APP_PORT}`);
    });

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
    const { db } = require('../dist-server/lib/db/database.js');
    db.flush();
    db.close();
  } catch { /* ignore */ }
  localServer?.close();
  app.quit();
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
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

function setupIpcHandlers() {
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

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));
  ipcMain.handle('app:getPlatform', () => process.platform);

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  ipcMain.handle('backup:create', async () => {
    const folderPath = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select backup location',
    });
    if (folderPath.canceled) return { success: false, error: 'Cancelled' };
    try {
      const { db } = require('../dist-server/lib/db/database.js');
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
      const { db } = require('../dist-server/lib/db/database.js');
      db.restore(filePath.filePaths[0]);
      mainWindow?.webContents.reload();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('print:page', async (_, options) => {
    const win = mainWindow;
    return new Promise((resolve) => {
      win?.webContents.print(
        { silent: false, printBackground: true, ...options },
        (success, errorType) => resolve({ success, errorType }),
      );
    });
  });

  ipcMain.handle('license:getFingerprint', async () => {
    const { licenseService } = require('../dist-server/lib/license/license-service.js');
    return licenseService.getHardwareFingerprint();
  });
}

app.whenReady().then(async () => {
  console.log('[AfyaCore] App ready, starting server and window...');
  try {
    await startLocalServer();
    console.log('[AfyaCore] Local server started successfully');
    
    setupIpcHandlers();
    createTray();
    
    console.log('[AfyaCore] Creating main window...');
    await createWindow();
    console.log('[AfyaCore] Main window created');
  } catch (err) {
    console.error('[AfyaCore] Fatal error during startup:', err);
    dialog.showErrorBox('Startup Error', `AfyaCore failed to start: ${err.message}`);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    shutdown();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});