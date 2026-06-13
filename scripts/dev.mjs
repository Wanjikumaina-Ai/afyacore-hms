// scripts/dev.mjs
//
// Runs Vite IN-PROCESS via the Vite Node API — no subprocess, no .cmd files,
// no orphan processes, no port races. Electron is spawned directly using
// its binary path from node_modules/electron/path.txt.

import { createServer }  from 'vite';
import { spawn }          from 'node:child_process';
import { createRequire }  from 'node:module';
import { resolve }        from 'node:path';
import { fileURLToPath }  from 'node:url';

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ── Resolve Electron binary via require('electron') — the official approach ───
const require     = createRequire(import.meta.url);
const electronBin = require('electron');

// ── Start Vite in-process ─────────────────────────────────────────────────────
console.log('[dev] Starting Vite...');

let server;
try {
  server = await createServer({
    configFile: resolve(projectRoot, 'vite.config.ts'),
    mode: 'development',
    root: projectRoot,
  });
  await server.listen();
} catch (err) {
  console.error('[dev] Vite failed to start:', err.message);
  process.exit(1);
}

const port = server.config.server.port ?? 5173;
server.printUrls();
console.log(`\n[dev] Vite ready on port ${port}. Launching Electron...`);

// ── Launch Electron ───────────────────────────────────────────────────────────
const electron = spawn(electronBin, ['.', '--dev'], {
  stdio: 'inherit',
  shell: false,
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_DEV_VITE_PORT: String(port),
  },
});

electron.on('error', async err => {
  console.error('[dev] Electron failed to launch:', err.message);
  await server.close();
  process.exit(1);
});

// When Electron window is closed → stop Vite and exit cleanly
electron.on('close', async code => {
  await server.close();
  process.exit(code ?? 0);
});

// Ctrl-C → close both cleanly
process.on('SIGINT', async () => {
  try { electron.kill(); } catch {}
  await server.close();
  process.exit(0);
});