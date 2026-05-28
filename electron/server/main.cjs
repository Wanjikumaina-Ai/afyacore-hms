"use strict";
// AfyaCore HMS - SERVER MAIN PROCESS
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require("electron");
const path   = require("node:path");
const fs     = require("node:fs");
const os     = require("node:os");
const http   = require("node:http");
const { execSync } = require("node:child_process");

const IS_DEV     = process.env.NODE_ENV === "development";
const APP_PORT   = 8080;
const WS_PORT    = 8081;
const APP_NAME   = "AfyaCore HMS Server";
const SERVICE_ID = "AfyaCoreHMSServer";

let userDataPath;
try { userDataPath = app.getPath("userData"); } catch { userDataPath = path.join(process.cwd(), ".afyadata"); }

const DATA_DIR    = path.join(userDataPath, "data");
const LOG_DIR     = path.join(userDataPath, "logs");
const CONFIG_FILE = path.join(userDataPath, "server.config.json");

let mainWindow = null;
let tray       = null;
let localServer = null;

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

// Ensure directories
[DATA_DIR, LOG_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Logger
function log(level, msg) {
  const line = "[" + new Date().toISOString() + "] [" + level + "] " + msg + "\n";
  process.stdout.write(line);
  try { fs.appendFileSync(path.join(LOG_DIR, "server-" + new Date().toISOString().slice(0,10) + ".log"), line); } catch {}
}

// Config
function readConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch {}
  return {};
}
function writeConfig(data) {
  const c = readConfig();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...c, ...data }, null, 2));
}
function checkSetupComplete() {
  const c = readConfig();
  return !!(c.setupComplete && c.hospitalName && c.licenseActivated);
}

// Get local IP
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of (iface || [])) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

// Dynamic import helper - works for both .ts (dev with tsx) and .js (prod)
async function dynImport(tsPath) {
  // In dev, tsx/esm loader handles .ts files
  // In prod, files are compiled to .js
  if (!IS_DEV) {
    const jsPath = tsPath.replace(/\.ts$/, ".js");
    return import(jsPath);
  }
  return import(tsPath);
}

// Start API
async function startApiServer() {
  try {
    const rootDir = process.cwd();
    const { db }           = await dynImport(path.join(rootDir, "src/lib/db/database.ts").replace(/\\/g, "/"));
    const { apiRouter }    = await dynImport(path.join(rootDir, "src/server/routes/api.ts").replace(/\\/g, "/"));
    const { wsServer }     = await dynImport(path.join(rootDir, "src/server/websocket/ws-server.ts").replace(/\\/g, "/"));
    const { serve }        = await import("@hono/node-server");
    const { seedPermissions, createDefaultSuperAdmin } = await dynImport(path.join(rootDir, "src/lib/auth/rbac-seeder.ts").replace(/\\/g, "/"));

    await db.initialize(DATA_DIR);
    log("INFO", "Database initialized");

    const config = readConfig();
    if (!config.rbacSeeded) {
      seedPermissions();
      await createDefaultSuperAdmin();
      writeConfig({ rbacSeeded: true });
      log("INFO", "RBAC seeded");
    }

    wsServer.init(WS_PORT);
    log("INFO", "WebSocket on port " + WS_PORT);

    localServer = serve({ fetch: apiRouter.fetch, port: APP_PORT, hostname: "0.0.0.0" }, () => {
      log("INFO", "API server on http://0.0.0.0:" + APP_PORT);
    });

    return { db, wsServer };
  } catch (err) {
    log("ERROR", "Failed to start API: " + err.message + "\n" + err.stack);
    throw err;
  }
}

// Create window
function createWindow(hash) {
  mainWindow = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1024, minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../shared/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !IS_DEV,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools();
  });

  mainWindow.on("close", e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173/" + (hash || ""));
  } else {
    mainWindow.loadFile(path.join(process.cwd(), "dist/index.html"), { hash: hash || "" });
  }
}

// Tray
function createTray() {
  try {
    tray = new Tray(nativeImage.createEmpty());
    const menu = Menu.buildFromTemplate([
      { label: APP_NAME, enabled: false },
      { label: "Server: " + getLocalIP() + ":" + APP_PORT, enabled: false },
      { type: "separator" },
      { label: "Open Dashboard", click: () => { mainWindow && mainWindow.show(); } },
      { label: "View Logs", click: () => shell.openPath(LOG_DIR) },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip(APP_NAME + " - " + getLocalIP());
    tray.on("double-click", () => { mainWindow && mainWindow.show(); });
  } catch (e) { log("WARN", "Tray creation failed: " + e.message); }
}

// IPC
function setupIPC() {
  ipcMain.handle("setup:complete", async (_, data) => {
    try {
      writeConfig({ setupComplete: true, hospitalName: data.hospitalName, licenseKey: data.licenseKey, licenseActivated: data.licenseActivated });
      setTimeout(() => {
        if (IS_DEV) mainWindow && mainWindow.loadURL("http://localhost:5173/#/dashboard");
        else mainWindow && mainWindow.loadFile(path.join(process.cwd(), "dist/index.html"), { hash: "/dashboard" });
      }, 500);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle("server:info", () => ({
    ip: getLocalIP(), port: APP_PORT, wsPort: WS_PORT,
    dataDir: DATA_DIR, version: app.getVersion(),
    platform: process.platform, hostname: os.hostname(), uptime: process.uptime(),
  }));

  ipcMain.handle("server:getConfig",   () => readConfig());
  ipcMain.handle("server:isSetupDone", () => checkSetupComplete());

  ipcMain.handle("dialog:selectFolder", async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle("backup:create", async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"], title: "Select backup folder" });
    if (r.canceled) return { success: false, error: "Cancelled" };
    try {
      const { db } = await dynImport(path.join(process.cwd(), "src/lib/db/database.ts").replace(/\\/g, "/"));
      db.backup(r.filePaths[0]);
      return { success: true, path: r.filePaths[0] };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle("backup:restore", async () => {
    const pick = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [{ name: "AfyaCore DB", extensions: ["db"] }] });
    if (pick.canceled) return { success: false, error: "Cancelled" };
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "warning", title: "Confirm Restore",
      message: "This will overwrite ALL current data. Cannot be undone. Continue?",
      buttons: ["Cancel", "Yes, Restore"], defaultId: 0,
    });
    if (confirm.response === 0) return { success: false, error: "Cancelled" };
    try {
      const { db } = await dynImport(path.join(process.cwd(), "src/lib/db/database.ts").replace(/\\/g, "/"));
      db.restore(pick.filePaths[0]);
      mainWindow && mainWindow.webContents.reload();
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle("service:register", () => {
    try {
      execSync("sc create " + SERVICE_ID + " binPath= \"" + process.execPath + " --service\" start= auto DisplayName= \"" + APP_NAME + "\"", { stdio: "pipe" });
      execSync("sc start " + SERVICE_ID, { stdio: "pipe" });
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle("app:getVersion",   () => app.getVersion());
  ipcMain.handle("app:openLogs",     () => shell.openPath(LOG_DIR));
  ipcMain.handle("window:minimize",  () => mainWindow && mainWindow.minimize());
  ipcMain.handle("window:maximize",  () => mainWindow && (mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()));
  ipcMain.handle("window:hide",      () => mainWindow && mainWindow.hide());

  ipcMain.handle("license:getFingerprint", async () => {
    const { licenseService } = await dynImport(path.join(process.cwd(), "src/lib/license/license-service.ts").replace(/\\/g, "/"));
    return licenseService.getHardwareFingerprint();
  });
  ipcMain.handle("license:activate", async (_, key) => {
    const { licenseService } = await dynImport(path.join(process.cwd(), "src/lib/license/license-service.ts").replace(/\\/g, "/"));
    return licenseService.activateLicense(key);
  });
  ipcMain.handle("license:status", async () => {
    const { licenseService } = await dynImport(path.join(process.cwd(), "src/lib/license/license-service.ts").replace(/\\/g, "/"));
    return licenseService.validateLicense();
  });
}

// Lifecycle
app.whenReady().then(async () => {
  log("INFO", "Starting " + APP_NAME);

  try { await startApiServer(); }
  catch (err) {
    dialog.showErrorBox("Startup Failed", "AfyaCore Server failed to start:\n\n" + err.message);
    app.quit(); return;
  }

  setupIPC();
  createTray();

  const setupDone = checkSetupComplete();
  createWindow(setupDone ? "#/dashboard" : "#/setup");
  log("INFO", "Server IP: " + getLocalIP() + ":" + APP_PORT);
});

app.on("window-all-closed", () => { /* keep alive in tray */ });

app.on("before-quit", async () => {
  app.isQuitting = true;
  try {
    if (localServer) localServer.close();
    const { db } = await dynImport(path.join(process.cwd(), "src/lib/db/database.ts").replace(/\\/g, "/"));
    db.flush(); db.close();
  } catch {}
  log("INFO", "Shutdown complete");
});

process.on("uncaughtException",  e => log("ERROR", "Uncaught: " + e.message));
process.on("unhandledRejection", r => log("ERROR", "Unhandled: " + String(r)));