/**
 * FILE: electron/main.cjs
 */

'use strict';

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const { spawn }   = require('child_process');
const path        = require('path');
const fs          = require('fs');

let dynamicPort   = null;
let splashWindow  = null;
let mainWindow    = null;
let serverProcess = null;

function appRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

function findNodeBin() {
  const bundled = path.join(process.resourcesPath, 'node', 'node.exe');
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const net    = require('net');
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Start the Hono server and resolve the moment it prints
 * "Server started on port XXXX" — no HTTP polling at all.
 */
function startServer() {
  return new Promise(async (resolve, reject) => {
    // DEV: Vite is already running in terminal 1
    if (!app.isPackaged) {
      dynamicPort = 4000;
      resolve();
      return;
    }

    dynamicPort = await getFreePort();

    const root        = appRoot();
    const serverEntry = path.join(root, 'build', 'server', 'index.js');
    const nodeBin     = findNodeBin();

    console.log('[main] appRoot:', root);
    console.log('[main] serverEntry:', serverEntry);
    console.log('[main] port assigned:', dynamicPort);
    console.log('[main] nodeBin:', nodeBin);

    const child = spawn(nodeBin, [serverEntry], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT:     String(dynamicPort),
        APP_ROOT: root,
      },
      stdio: 'pipe',
    });

    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start within 30s on port ${dynamicPort}`));
    }, 30000);

    // Resolve the MOMENT the server says it's ready — no polling
    child.stdout?.on('data', (d) => {
      const msg = d.toString();
      console.log('[server]', msg.trim());

      // Your Hono server prints this exact line when ready:
      // "🚀 Server started on port XXXX"
      if (msg.includes('Server started on port') || msg.includes('server started on port')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr?.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.error('[server stderr]', msg);
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[server] failed to start:', err.message);
      reject(err);
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        console.error(`[server] exited with code ${code}`);
        reject(new Error(`Server process exited with code ${code}`));
      }
    });

    serverProcess = child;
  });
}

function createMainWindow() {
  const iconPath   = path.join(__dirname, 'icon.png');
  const iconExists = fs.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width:    1280,
    height:   800,
    show:     false,
    title:    'AfyaCore HMS',
    ...(iconExists ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${dynamicPort}`) || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width:          480,
    height:         320,
    frame:          false,
    transparent:    true,
    resizable:      false,
    alwaysOnTop:    false,
    skipTaskbar:    true,
    parent:         mainWindow,   // bound to app window only
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
  splashWindow.on('closed', () => { splashWindow = null; });
}

function setSplashStatus(text, colour = '#94a3b8') {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(
      `(function(){
        var el = document.getElementById('status');
        if(el){ el.textContent=${JSON.stringify(text)}; el.style.color=${JSON.stringify(colour)}; }
      })()`
    )
    .catch(() => {});
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  mainWindow.show();
  mainWindow.maximize();
  mainWindow.focus();
}

// ─── IPC: hot update — renderer reload only, no restart ──────────────────────
ipcMain.on('apply-update', (_event, version) => {
  console.log('[updater] applying update v' + version + ' — reloading renderer');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1. Main window first (hidden) — splash needs it as parent
  createMainWindow();

  // 2. Splash parented to mainWindow — stays on app window only
  createSplash();
  setSplashStatus('Starting…');

  try {
    // 3. Start server — resolves instantly when server signals ready
    await startServer();

    // 4. Load app
    setSplashStatus('Loading…');
    mainWindow.loadURL(`http://localhost:${dynamicPort}`);

    // 5. Show the moment first paint is done
    mainWindow.once('ready-to-show', () => {
      showMainWindow();
    });

  } catch (err) {
    console.error('Startup failed:', err.message);
    setSplashStatus('Failed to start — please restart.', '#f87171');
    dialog.showErrorBox(
      'AfyaCore – Startup Error',
      `The application could not be started.\n\n${err.message}\n\nPlease restart.`
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});