const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('node:path');
const { serve } = require('@hono/node-server');

let mainWindow = null;
let tray = null;
let localServer = null;

const APP_PORT = 8080;
const WS_PORT = 8081;
const IS_DEV = process.env.NODE_ENV === 'development';
const VITE_DEV_URL = 'http://localhost:5173';

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
    show: false,
  });

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (IS_DEV) {
    await mainWindow.loadURL(VITE_DEV_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../build/client/index.html'));
  }
}

async function startLocalServer() {
  try {
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

    localServer = serve({ fetch: apiRouter.fetch, port: APP_PORT }, () => {
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
  const iconPath = path.join(__dirname, '../public/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'AfyaCore HMS', enabled: false },
    { type: 'separator' },
    { label: 'Open', click: