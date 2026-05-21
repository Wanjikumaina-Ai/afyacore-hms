'use strict';

const { ipcMain, app }  = require('electron');
const https             = require('https');
const http              = require('http');
const fs                = require('fs');
const path              = require('path');
const { createHash }    = require('crypto');
const { execSync }      = require('child_process');
const AdmZip            = require('adm-zip'); // npm install adm-zip

const MANIFEST_URL = 'https://updates.yourdomain.com/latest.json';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // check every 30 minutes

let mainWindow = null;

function setMainWindow(win) {
  mainWindow = win;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file   = fs.createWriteStream(destPath);
    client.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function getCurrentVersion() {
  return app.getVersion(); // reads from package.json
}

function compareVersions(a, b) {
  // returns true if b is newer than a
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pb[i] > pa[i]) return true;
    if (pb[i] < pa[i]) return false;
  }
  return false;
}

async function applyUpdate(manifest) {
  const tmpZip  = path.join(app.getPath('temp'), 'afyacore-update.zip');
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');

  console.log('[updater] downloading update...');
  await downloadFile(manifest.download, tmpZip);

  // Optional checksum verify
  if (manifest.checksum) {
    const hash = createHash('sha256')
      .update(fs.readFileSync(tmpZip))
      .digest('hex');
    if (`sha256-${hash}` !== manifest.checksum) {
      fs.unlinkSync(tmpZip);
      throw new Error('Checksum mismatch — update aborted');
    }
  }

  console.log('[updater] extracting update...');
  const zip = new AdmZip(tmpZip);
  zip.extractAllTo(appRoot, true); // overwrites in place

  fs.unlinkSync(tmpZip);
  console.log('[updater] update applied — reloading renderer');

  // Reload renderer only — NO restart
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
    // Notify the UI with a toast
    setTimeout(() => {
      mainWindow.webContents.executeJavaScript(`
        window.__afyaToast?.('AfyaCore updated to v${manifest.version}', 'success');
      `).catch(() => {});
    }, 2000); // wait for reload to settle
  }
}

async function checkForUpdates(silent = true) {
  try {
    const manifest = await fetchJSON(MANIFEST_URL);
    const current  = getCurrentVersion();

    if (!compareVersions(current, manifest.version)) {
      if (!silent) console.log('[updater] already on latest:', current);
      return;
    }

    console.log(`[updater] update available: ${current} → ${manifest.version}`);
    await applyUpdate(manifest);

  } catch (err) {
    console.error('[updater] check failed:', err.message);
  }
}

function startUpdateScheduler(win) {
  setMainWindow(win);

  // Check once on startup (after 10s delay — let app settle first)
  setTimeout(() => checkForUpdates(true), 10000);

  // Then check every 30 minutes
  setInterval(() => checkForUpdates(true), CHECK_INTERVAL_MS);
}

// Manual trigger from renderer if you want a "Check for updates" button
ipcMain.on('check-for-updates', () => checkForUpdates(false));

module.exports = { startUpdateScheduler };