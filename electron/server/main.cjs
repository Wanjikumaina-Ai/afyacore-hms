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
let _db         = null; // assigned in startApiServer(); used by isSetupComplete()

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
  // Source of truth: SQLite system_config table, written by POST /auth/setup-admin.
  if (_db) {
    try {
      const row = _db.findOne(`SELECT value FROM system_config WHERE key = 'setup_complete'`);
      return row?.value === '1';
    } catch {}
  }
  // Fallback before DB is loaded
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


// ── Setup wizard HTML ─────────────────────────────────────────────────────────
// Served at GET /setup-wizard from Hono. No React or Vite dependency.
const SETUP_WIZARD_HTML = (isDev) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AfyaCore HMS — Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#0a0f1e,#0d1b2a);font-family:system-ui,sans-serif;padding:24px}
.card{width:100%;max-width:480px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
  border-radius:20px;padding:40px;box-shadow:0 24px 64px rgba(0,0,0,.5)}
h1{color:#fff;font-size:22px;font-weight:700;text-align:center;margin-bottom:4px}
.sub{color:rgba(255,255,255,.4);font-size:13px;text-align:center;margin-bottom:28px}
.steps{display:flex;margin-bottom:28px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
.step{flex:1;padding:7px 2px;font-size:11px;font-weight:600;text-align:center;
  background:transparent;color:rgba(255,255,255,.3);border-right:1px solid rgba(255,255,255,.08)}
.step.active{background:rgba(59,130,246,.25);color:#93c5fd}
.step.done{background:rgba(16,185,129,.2);color:#34d399}
h2{color:#fff;font-size:17px;font-weight:600;margin-bottom:6px}
p.desc{color:rgba(255,255,255,.45);font-size:13px;margin-bottom:20px}
label{display:block;color:rgba(255,255,255,.7);font-size:13px;font-weight:500;margin-bottom:5px}
input{width:100%;padding:10px 14px;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;
  outline:none;margin-bottom:14px;font-family:inherit}
input:focus{border-color:rgba(99,179,237,.8)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{width:100%;padding:12px;border-radius:10px;border:none;background:rgba(59,130,246,.85);
  color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-top:4px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-back{background:none;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);
  padding:10px;border-radius:10px;width:100%;cursor:pointer;margin-top:8px;font-size:14px}
.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;
  padding:11px 14px;color:#fca5a5;font-size:13px;margin-bottom:16px;display:none}
.done-icon{font-size:48px;text-align:center;margin:12px 0}
.done-title{color:#34d399;font-size:19px;font-weight:700;text-align:center;margin-bottom:8px}
.done-text{color:rgba(255,255,255,.5);font-size:14px;text-align:center;line-height:1.6}
.info{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);border-radius:10px;
  padding:12px 14px;color:rgba(255,255,255,.6);font-size:13px;text-align:center;margin-top:20px}
.logo{text-align:center;margin-bottom:28px}
.logo svg{display:block;margin:0 auto 12px}
</style></head><body><div class="card">
  <div class="logo">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="14" fill="rgba(59,130,246,0.15)" stroke="rgba(99,179,237,0.3)" stroke-width="1"/>
      <path d="M24 14v20M14 24h20" stroke="rgba(99,179,237,0.9)" stroke-width="3" stroke-linecap="round"/>
    </svg>
    <h1>AfyaCore HMS</h1>
    <p class="sub">First-Time System Setup</p>
  </div>
  <div class="steps">
    <div class="step active" id="s0">Hospital</div>
    <div class="step" id="s1">Admin Account</div>
    <div class="step" id="s2">Done</div>
  </div>
  <div id="err" class="err"></div>
  <div id="p0">
    <h2>Hospital Details</h2>
    <p class="desc">Enter this facility's information.</p>
    <label>Hospital / Facility Name *</label>
    <input id="hospitalName" placeholder="Kenyatta General Hospital"/>
    <label>Phone Number</label>
    <input id="hospitalPhone" placeholder="+254 700 000 000"/>
    <label>Physical Address</label>
    <input id="hospitalAddress" placeholder="Nairobi, Kenya"/>
    <label>NHIF Code (optional)</label>
    <input id="nhifCode" placeholder="HF-XXXXX"/>
    <button class="btn" onclick="step1()">Continue →</button>
  </div>
  <div id="p1" style="display:none">
    <h2>Super-Admin Account</h2>
    <p class="desc">Master account for this hospital. Hand credentials to the admin after setup.</p>
    <div class="g2">
      <div><label>First Name *</label><input id="firstName" placeholder="John"/></div>
      <div><label>Last Name *</label><input id="lastName" placeholder="Doe"/></div>
    </div>
    <label>Username *</label><input id="username" placeholder="admin"/>
    <label>Email *</label><input id="email" type="email" placeholder="admin@hospital.co.ke"/>
    <label>Password *</label><input id="password" type="password" placeholder="Min 8 characters"/>
    <label>Confirm Password *</label><input id="confirm" type="password" placeholder="Repeat password"/>
    <button class="btn" id="submitBtn" onclick="submit()">Complete Setup →</button>
    <button class="btn-back" onclick="back()">← Back</button>
  </div>
  <div id="p2" style="display:none">
    <div class="done-icon">✅</div>
    <h2 class="done-title">Setup Complete!</h2>
    <p class="done-text">Sign in with the admin credentials you just created.</p>
    <div class="info">📡 Staff connect to this machine's IP on port <strong style="color:#93c5fd">8080</strong></div>
    <button class="btn" style="background:rgba(16,185,129,.8);margin-top:20px" onclick="launch()">Go to Sign In →</button>
  </div>
</div>
<script>
const REDIRECT='${isDev ? "http://localhost:5173/" : "/"}';
const g=id=>document.getElementById(id);
const v=id=>g(id).value.trim();
function err(m){const e=g('err');e.textContent=m;e.style.display=m?'block':'none';}
function steps(n){['s0','s1','s2'].forEach((s,i)=>g(s).className='step'+(i<n?' done':i===n?' active':''));}
function show(p){['p0','p1','p2'].forEach(id=>g(id).style.display=id===p?'':'none');}
function step1(){err('');if(!v('hospitalName')){err('Hospital name is required.');return;}show('p1');steps(1);}
function back(){err('');show('p0');steps(0);}
async function submit(){
  err('');
  if(!v('firstName')||!v('lastName')||!v('username')||!v('email')||!g('password').value){
    err('All fields marked * are required.');return;}
  if(g('password').value!==g('confirm').value){err('Passwords do not match.');return;}
  if(g('password').value.length<8){err('Password must be at least 8 characters.');return;}
  const btn=g('submitBtn');btn.disabled=true;btn.textContent='Setting up…';
  try{
    const r=await fetch('http://localhost:8080/auth/setup-admin',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:v('username').toLowerCase(),email:v('email').toLowerCase(),
        password:g('password').value,firstName:v('firstName'),lastName:v('lastName'),
        hospitalName:v('hospitalName'),
        hospitalPhone:v('hospitalPhone')||undefined,
        hospitalAddress:v('hospitalAddress')||undefined,
        nhifCode:v('nhifCode')||undefined})
    });
    const d=await r.json();
    if(!r.ok){err(d.error||'Setup failed.');btn.disabled=false;btn.textContent='Complete Setup →';return;}
    show('p2');steps(2);
  }catch(e){err('Error: '+e.message);btn.disabled=false;btn.textContent='Complete Setup →';}
}
function launch(){window.location.href=REDIRECT;}
</script></body></html>`;

// ── Start API server ──────────────────────────────────────────
async function startApiServer() {
  log("INFO", `Loading server modules from ${BUNDLE_DIR}`);

  const mods = await loadServerModules();
  services = mods;

  const { db, apiRouter, setupRouter, wsServer, seedPermissions, createDefaultSuperAdmin } = mods;
  _db = db; // expose to isSetupComplete()
  const { Hono }  = await import("hono");
  const { serve } = await import("@hono/node-server");

  // Initialize database
  await db.initialize(DATA_DIR);
  log("INFO", "Database initialized at " + DATA_DIR);

  // Seed roles/permissions (idempotent). Never create a default admin —
  // the setup wizard (POST /auth/setup-admin) creates the first admin account.
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

  // Setup wizard served directly by Hono (no React dependency)
  rootApp.get("/setup-wizard", (c) => c.html(SETUP_WIZARD_HTML(IS_DEV)));

  // Setup status for root.tsx gate
  rootApp.get("/api/setup/status", (c) => c.json({ complete: isSetupComplete() }));

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
  mainWindow = new BrowserWindow({
    width: 1400, height: 880,
    minWidth: 1024, minHeight: 680,
    title: APP_NAME,
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
    // DevTools: Ctrl+Shift+I
  });

  // Hide to tray instead of closing
  mainWindow.on("close", e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  // URL is set by the caller after createWindow() returns.
}

// ── System tray ───────────────────────────────────────────────
function createTray() {
  try {
    const iconPath = path.join(ROOT, "build/server/tray.ico");
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();

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

  createWindow();

  // Serve setup wizard from Hono when not configured — no React dependency.
  // After setup completes, wizard redirects to the React app.
  if (isSetupComplete()) {
    if (IS_DEV) mainWindow.loadURL("http://localhost:5173/").catch(() => {});
    else mainWindow.loadFile(path.join(ROOT, "build/client/index.html")).catch(() => {});
  } else {
    mainWindow.loadURL("http://localhost:8080/setup-wizard").catch(() => {});
  }
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