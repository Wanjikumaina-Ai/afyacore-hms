// scripts/dev.mjs
// Kills any process on port 5173, starts Vite (which is forced to 5173
// via strictPort in vite.config.ts), waits for the port to open via TCP,
// then launches Electron.
//
// Usage:  pnpm dev

import { spawn }      from 'node:child_process';
import net             from 'node:net';
import { createServer } from 'node:net';

const PORT         = 5173;
const POLL_MS      = 1000;   // probe every 1 second
const MAX_WAIT_MS  = 180_000; // 3 minutes max

// ── helpers ──────────────────────────────────────────────────────────────────

/** Kill whatever process is holding a port (Windows + Unix). */
function freePort(port) {
  return new Promise((resolve) => {
    // Try to bind the port ourselves. If it succeeds, nothing is using it.
    const tester = createServer();
    tester.once('error', () => {
      // Port is in use — kill it
      const killer = spawn(
        process.platform === 'win32'
          ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port} "') do taskkill /F /PID %a`
          : `lsof -ti:${port} | xargs kill -9`,
        { shell: true, stdio: 'ignore' }
      );
      killer.on('close', () => setTimeout(resolve, 500));
    });
    tester.once('listening', () => {
      tester.close(resolve); // port was free, nothing to do
    });
    tester.listen(port, '127.0.0.1');
  });
}

/** Resolve when localhost:port accepts a TCP connection. */
function waitForPort(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + MAX_WAIT_MS;

    const probe = () => {
      const sock = new net.Socket();
      let done = false;

      sock.setTimeout(800);

      sock.connect(port, '127.0.0.1', () => {
        done = true;
        sock.destroy();
        resolve();
      });

      const retry = () => {
        if (done) return;
        done = true;
        sock.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Port ${port} never opened within ${MAX_WAIT_MS / 1000}s`));
        } else {
          setTimeout(probe, POLL_MS);
        }
      };

      sock.on('error',   retry);
      sock.on('timeout', retry);
    };

    probe();
  });
}

// ── 1. Free port 5173 ────────────────────────────────────────────────────────
console.log(`[dev] Freeing port ${PORT}...`);
await freePort(PORT);

// ── 2. Start Vite ────────────────────────────────────────────────────────────
console.log('[dev] Starting Vite...');
const vite = spawn('pnpm', ['run', 'dev:vite'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});

vite.on('error', (err) => { console.error('[dev] Vite error:', err.message); process.exit(1); });
vite.on('close', (code) => {
  if (code !== 0 && code !== null) process.exit(code);
});

// ── 3. Wait for Vite to be ready ─────────────────────────────────────────────
console.log('[dev] Waiting for Vite on port', PORT, '...');
try {
  await waitForPort(PORT);
} catch (err) {
  console.error('[dev]', err.message);
  vite.kill();
  process.exit(1);
}
console.log('[dev] Vite ready. Launching Electron...');

// ── 4. Launch Electron ────────────────────────────────────────────────────────
const electron = spawn('electron', ['.', '--dev'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_DEV_VITE_PORT: String(PORT),
  },
});

electron.on('error', (err) => { console.error('[dev] Electron error:', err.message); vite.kill(); process.exit(1); });
electron.on('close', (code) => { vite.kill(); process.exit(code ?? 0); });

// ── 5. Ctrl-C ─────────────────────────────────────────────────────────────────
const cleanExit = () => { try { electron.kill(); } catch {} try { vite.kill(); } catch {} process.exit(0); };
process.on('SIGINT',  cleanExit);
process.on('SIGTERM', cleanExit);