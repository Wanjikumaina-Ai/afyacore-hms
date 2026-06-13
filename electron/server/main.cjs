"use strict";
// ============================================================
// AfyaCore HMS - SERVER MAIN PROCESS (PRODUCTION GRADE)
// Imports from pre-bundled dist-server/ directory
// No dynamic TypeScript loading - works permanently
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require("electron");
const path    = require("node:path");
const fs      = require("node:fs");
const os      = require("node:os");
const { execSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

// ── Constants ─────────────────────────────────────────────────
const IS_DEV   = process.env.NODE_ENV === "development";
const APP_PORT = 8080;
const WS_PORT  = 8081;
const APP_NAME = "AfyaCore HMS Server";
const ROOT     = path.resolve(__dirname, "../..");

// Data paths
const DATA_DIR    = path.join(app.getPath("userData"), "data");
const LOG_DIR     = path.join(app.getPath("userData"), "logs");
const CONFIG_FILE = path.join(app.getPath("userData"), "server.config.json");
const BUNDLE_DIR  = path.join(ROOT, "dist-server");

// ── Globals ───────────────────────────────────────────────────
let mainWindow  = null;
let tray        = null;
let localServer = null;
let services    = {};

// ── Single instance lock ──────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

// ── Ensure data dirs ──────────────────────────────────────────
[DATA_DIR, LOG_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Logger ────────────────────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(
      path.join(LOG_DIR, `server-${new Date().toISOString().slice(0,10)}.log`),
      line
    );
  } catch {}
}

// ── Config helpers ────────────────────────────────────────────
function readConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch {}
  return {};
}
function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), ...data }, null, 2));
}
function isSetupComplete() {
  const c = readConfig();
  return !!(c.setupComplete && c.hospitalName && c.licenseActivated);
}

// ── Network ───────────────────────────────────────────────────
function getLocalIP() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of (iface || [])) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

// ── Import bundled server modules ─────────────────────────────
// All TypeScript is pre-compiled to dist-server/ by bundle-electron.mjs
// This is the permanent solution - plain ESM imports, no TS at runtime
async function loadServerModules() {
  const toURL = (rel) => pathToFileURL(path.join(BUNDLE_DIR, rel)).href;

  const [
    { db }                                              = await import(toURL("lib/db/database.js")),
    { apiRouter }                                       = await import(toURL("server/routes/api.js")),
    { setupRouter }                                     = await import(toURL("server/routes/setup.js")),
    { wsServer }                                        = await import(toURL("server/websocket/ws-server.js")),
    { seedPermissions, createDefaultSuperAdmin }        = await import(toURL("lib/auth/rbac-seeder.js")),
    { licenseService }                                  = await import(toURL("lib/license/license-service.js")),
  ] = await Promise.all([
    import(toURL("lib/db/database.js")),
    import(toURL("server/routes/api.js")),
    import(toURL("server/routes/setup.js")),
    import(toURL("server/websocket/ws-server.js")),
    import(toURL("lib/auth/rbac-seeder.js")),
    import(toURL("lib/license/license-service.js")),
  ]);

  return { db, apiRouter, setupRouter, wsServer, seedPermissions, createDefaultSuperAdmin, licenseService };
}

// ── Start API server ──────────────────────────────────────────
async function startApiServer() {
  log("INFO", `Loading server modules from ${BUNDLE_DIR}`);

  const mods = await loadServerModules();
  services = mods;

  const { db, apiRouter, setupRouter, wsServer, seedPermissions, createDefaultSuperAdmin } = mods;
  const { Hono }  = await import("hono");
  const { serve } = await import("@hono/node-server");

  // Initialize database
  await db.initialize(DATA_DIR);
  log("INFO", "Database initialized at " + DATA_DIR);

  // Seed roles/permissions (idempotent — safe to call every time).
  // Never create a default admin — the setup wizard creates the first admin account.
  seedPermissions();
  log("INFO", "RBAC permissions seeded");


  // ── Auth/token adapter ─────────────────────────────────────────
  // The frontend calls POST/GET /api/auth/token (cookie-based).
  // This bridges it to the actual auth_users + sessions DB tables.
  const { randomBytes } = await import("node:crypto");
  const bcrypt = await import("bcryptjs");

  const authAdapter = new Hono();

  // GET /api/auth/token — check active session from cookie
  authAdapter.get("/api/auth/token", async (c) => {
    const token = getCookieToken(c);
    if (!token) return c.json({ user: null }, 200);
    const { db } = services;
    if (!db?.ready) return c.json({ user: null }, 200);
    const session = db.findOne(
      `SELECT s.*, u.id as uid, u.name, u.email, u.role, u.facility_id, u.department_id, u.avatar
       FROM sessions s JOIN auth_users u ON u.id = s.user_id
       WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')`,
      [token]
    );
    if (!session) return c.json({ user: null }, 200);
    return c.json({
      user: {
        id: session.uid, name: session.name, email: session.email,
        role: session.role, facilityId: session.facility_id,
        departmentId: session.department_id, avatar: session.avatar,
      }
    });
  });

  // POST /api/auth/token — signin or signout
  authAdapter.post("/api/auth/token", async (c) => {
    const { db } = services;
    if (!db?.ready) return c.json({ error: "Server starting up" }, 503);
    const body = await c.req.json().catch(() => ({}));
    const action = body.action;

    if (action === "signout") {
      const token = getCookieToken(c);
      if (token) db.run("DELETE FROM sessions WHERE token = ?", [token]);
      clearSessionCookie(c);
      return c.json({ success: true });
    }

    if (action === "signin") {
      const { email, password } = body;
      if (!email || !password) return c.json({ error: "Email and password required" }, 400);
      const user = db.findOne(
        "SELECT * FROM auth_users WHERE email = ? AND is_active = 1", [email]
      );
      if (!user) return c.json({ error: "Invalid email or password" }, 401);
      const valid = await bcrypt.default.compare(password, user.password_hash);
      if (!valid) return c.json({ error: "Invalid email or password" }, 401);

      const token = randomBytes(48).toString("hex");
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      db.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
      db.run(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
        [user.id, token, expires]
      );
      setSessionCookie(c, token);
      return c.json({
        user: {
          id: user.id, name: user.name, email: user.email,
          role: user.role, facilityId: user.facility_id,
          departmentId: user.department_id, avatar: user.avatar,
        }
      });
    }

    return c.json({ error: "Unknown action" }, 400);
  });

  function getCookieToken(c) {
    const cookieHeader = c.req.header("Cookie") || "";
    const match = cookieHeader.match(/(?:^|;\s*)afya_session=([^;]+)/);
    return match ? match[1] : null;
  }
  function setSessionCookie(c, token) {
    c.header("Set-Cookie", `afya_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  }
  function clearSessionCookie(c) {
    c.header("Set-Cookie", "afya_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  }
  // ── End auth adapter ───────────────────────────────────────────

  // Mount routers
  const rootApp = new Hono();

  // Setup status endpoint — read by root.tsx before auth check
  rootApp.get("/api/setup/status", (c) => {
    return c.json({ complete: isSetupComplete() });
  });

  rootApp.route("/", authAdapter);
  rootApp.route("/", setupRouter);
  rootApp.route("/", apiRouter);

  // Start WebSocket
  wsServer.init(WS_PORT);
  log("INFO", `WebSocket server on port ${WS_PORT}`);

  // Start HTTP - bind to 0.0.0.0 so LAN clients can connect
  localServer = serve(
    { fetch: rootApp.fetch, port: APP_PORT, hostname: "0.0.0.0" },
    () => log("INFO", `API server running on http://0.0.0.0:${APP_PORT}`)
  );

  log("INFO", `Server IP for staff: http://${getLocalIP()}:${APP_PORT}`);
}

// ── Create main window ────────────────────────────────────────
function createWindow() {
  const iconFile = path.join(__dirname, '../icon.ico');
  const iconExists = fs.existsSync(iconFile);

  mainWindow = new BrowserWindow({
    width: 1400, height: 880,
    minWidth: 1024, minHeight: 680,
    title: APP_NAME,
    icon: iconExists ? iconFile : undefined,
    backgroundColor: "#0f172a",
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../shared/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !IS_DEV,
    },
  });

  // Security headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:${WS_PORT} http://localhost:${APP_PORT} http://${getLocalIP()}:${APP_PORT};`
        ],
      },
    });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // DevTools: open manually with Ctrl+Shift+I
  });

  // Hide to tray instead of closing
  mainWindow.on("close", e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  // root.tsx checks /api/setup/status and redirects to /account/setup automatically.
  // No need to pass hash — just load the root and let React Router handle it.
  mainWindow.webContents.on("did-fail-load", (_, code, desc) => {
    if (code === -3) return; // ERR_ABORTED — ignore
    log("WARN", `Page load failed (${code}: ${desc}) — retrying in 2s`);
    setTimeout(() => {
      if (!mainWindow) return;
      if (IS_DEV) mainWindow.loadURL("http://localhost:5173/").catch(() => {});
      else mainWindow.loadFile(path.join(ROOT, "build/client/index.html")).catch(() => {});
    }, 2000);
  });

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173/").catch((err) => {
      log("WARN", "Initial loadURL failed: " + err.message);
    });
  } else {
    mainWindow.loadFile(path.join(ROOT, "build/client/index.html")).catch((err) => {
      log("WARN", "Initial loadFile failed: " + err.message);
    });
  }
}

// ── System tray ───────────────────────────────────────────────
function createTray() {
  try {
    const trayIconPath = fs.existsSync(path.join(ROOT, "build/server/tray.ico"))
      ? path.join(ROOT, "build/server/tray.ico")
      : path.join(__dirname, "../icon.png");
    const icon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });

    tray = new Tray(icon);
    const ip = getLocalIP();

    tray.setContextMenu(Menu.buildFromTemplate([
      { label: APP_NAME, enabled: false },
      { label: `● Running  ${ip}:${APP_PORT}`, enabled: false },
      { type: "separator" },
      { label: "Open Dashboard",       click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: "View Server Logs",     click: () => shell.openPath(LOG_DIR) },
      { label: "Open Data Folder",     click: () => shell.openPath(DATA_DIR) },
      { type: "separator" },
      { label: "Register Windows Service", click: registerWindowsService },
      { type: "separator" },
      { label: "Quit AfyaCore Server", click: () => { app.isQuitting = true; app.quit(); } },
    ]));

    tray.setToolTip(`${APP_NAME}  ${ip}:${APP_PORT}`);
    tray.on("double-click", () => { mainWindow?.show(); mainWindow?.focus(); });
    log("INFO", "System tray created");
  } catch (e) {
    log("WARN", "Tray creation failed (non-fatal): " + e.message);
  }
}

// ── Windows service ───────────────────────────────────────────
function registerWindowsService() {
  if (process.platform !== "win32") return;
  try {
    const exe = `"${process.execPath}"`;
    execSync(`sc create "AfyaCoreHMSServer" binPath= ${exe} start= auto DisplayName= "AfyaCore HMS Server"`, { stdio: "pipe" });
    execSync(`sc description "AfyaCoreHMSServer" "AfyaCore Hospital Management System"`, { stdio: "pipe" });
    execSync(`sc failure "AfyaCoreHMSServer" reset= 60 actions= restart/5000/restart/10000/restart/30000`, { stdio: "pipe" });
    execSync(`sc start "AfyaCoreHMSServer"`, { stdio: "pipe" });
    log("INFO", "Windows service registered and started");
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Service Registered",
      message: "AfyaCore Server registered as a Windows service.\n\nIt will now start automatically when Windows boots.\n\nService name: AfyaCoreHMSServer",
    });
  } catch (err) {
    log("ERROR", "Service registration failed: " + err.message);
    dialog.showErrorBox("Service Registration Failed",
      `Run PowerShell as Administrator and try again.\n\nError: ${err.message}`
    );
  }
}

// ── IPC handlers ─────────────────────────────────────────────
function setupIPC() {
  // Setup wizard
  ipcMain.handle("setup:complete", async (_, data) => {
    try {
      writeConfig({
        setupComplete: true,
        hospitalName: data.hospitalName,
        licenseKey: data.licenseKey,
        licenseActivated: data.licenseActivated,
        setupDate: new Date().toISOString(),
      });
      setTimeout(() => {
        const url = IS_DEV ? "http://localhost:5173/#/dashboard" : null;
        if (url) mainWindow?.loadURL(url);
        else mainWindow?.loadFile(path.join(ROOT, "build/client/index.html"), { hash: "/dashboard" });
      }, 300);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle("server:info", () => ({
    ip: getLocalIP(), port: APP_PORT, wsPort: WS_PORT,
    dataDir: DATA_DIR, version: app.getVersion(),
    platform: process.platform, hostname: os.hostname(),
    uptime: Math.floor(process.uptime()),
  }));

  ipcMain.handle("server:getConfig",   () => readConfig());
  ipcMain.handle("server:isSetupDone", () => isSetupComplete());

  ipcMain.handle("dialog:selectFolder", async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle("backup:create", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"], title: "Select backup destination",
    });
    if (r.canceled) return { success: false, error: "Cancelled" };
    try { services.db?.backup(r.filePaths[0]); return { success: true, path: r.filePaths[0] }; }
    catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle("backup:restore", async () => {
    const pick = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "AfyaCore Database", extensions: ["db"] }],
    });
    if (pick.canceled) return { success: false, error: "Cancelled" };
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "warning", title: "Confirm Restore",
      message: "This will overwrite ALL current data. Cannot be undone. Continue?",
      buttons: ["Cancel", "Yes, Restore"], defaultId: 0,
    });
    if (confirm.response === 0) return { success: false, error: "Cancelled" };
    try {
      services.db?.restore(pick.filePaths[0]);
      mainWindow?.webContents.reload();
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle("service:register",   () => { registerWindowsService(); return { success: true }; });
  ipcMain.handle("app:getVersion",     () => app.getVersion());
  ipcMain.handle("app:openLogs",       () => shell.openPath(LOG_DIR));
  ipcMain.handle("window:minimize",    () => mainWindow?.minimize());
  ipcMain.handle("window:maximize",    () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle("window:hide",        () => mainWindow?.hide());

  ipcMain.handle("license:getFingerprint", () => services.licenseService?.getHardwareFingerprint());
  ipcMain.handle("license:activate",  (_, key) => services.licenseService?.activateLicense(key));
  ipcMain.handle("license:status",    () => services.licenseService?.validateLicense());
}

// ── GPU / sandbox fixes (must run before app.whenReady) ─────────────────────
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('ignore-certificate-errors');

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  log("INFO", `Starting ${APP_NAME} v${app.getVersion()}`);
  log("INFO", `Bundle dir: ${BUNDLE_DIR}`);
  log("INFO", `Data dir:   ${DATA_DIR}`);

  // Verify bundle exists
  if (!fs.existsSync(BUNDLE_DIR)) {
    const msg = `Server bundle not found at:\n${BUNDLE_DIR}\n\nRun: npm run bundle\n\nThis builds the server code before Electron starts.`;
    log("ERROR", msg);
    dialog.showErrorBox("Bundle Missing", msg);
    app.quit();
    return;
  }

  try {
    await startApiServer();
  } catch (err) {
    log("ERROR", "Startup failed: " + err.stack);
    dialog.showErrorBox("Startup Failed", `AfyaCore Server failed to start:\n\n${err.message}`);
    app.quit();
    return;
  }

  setupIPC();
  createTray();

  // root.tsx handles all routing via /api/setup/status + /api/auth/token checks
  createWindow();
  log("INFO", `Ready. Staff connect to: http://${getLocalIP()}:${APP_PORT}`);
});

app.on("window-all-closed", () => { /* stay alive in tray */ });

app.on("before-quit", async () => {
  app.isQuitting = true;
  log("INFO", "Shutting down...");
  try {
    localServer?.close();
    services.wsServer?.close();
    services.db?.flush();
    services.db?.close();
  } catch {}
  log("INFO", "Shutdown complete");
});

process.on("uncaughtException",  e => log("ERROR", `Uncaught: ${e.message}\n${e.stack}`));
process.on("unhandledRejection", r => log("ERROR", `Unhandled: ${String(r)}`));