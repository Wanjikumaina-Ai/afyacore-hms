import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const file = resolve('build/server/assets/index-B1LgkJuP.js');
let c = readFileSync(file, 'utf8');

// Remove all previous patch debris
const patchedIdx = c.indexOf('// PATCHED');
if (patchedIdx !== -1) {
  const fnIdx = c.indexOf('async function findRouteFiles(dir) {', patchedIdx);
  if (fnIdx !== -1) {
    let depth = 0, i = fnIdx, end = -1;
    for (; i < c.length; i++) {
      if (c[i] === '{') depth++;
      else if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    c = c.slice(0, patchedIdx) + c.slice(end);
  }
}

// Find original function
const start = c.indexOf('async function findRouteFiles(dir) {');
if (start === -1) { console.error('Function not found'); process.exit(1); }

let depth = 0, i = start, end = -1;
for (; i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}

const newFn = `async function findRouteFiles(dir) {
  const { createRequire } = await import('module');
  const _req = createRequire(import.meta.url);
  const _fs = _req('fs');
  const _path = _req('path');
  const _here = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\\/([A-Za-z]:)/, '$1').replace(/\\//g, '\\\\');
  const _manifestPath = _path.resolve(_here, '..', 'route-manifest.json');
  const _appRoot = process.env.APP_ROOT ? process.env.APP_ROOT : _path.resolve(_here, '..', '..', '..', '..', '..');
  try {
    const manifest = JSON.parse(_fs.readFileSync(_manifestPath, 'utf8'));
    console.log('[manifest] loaded', manifest.length, 'routes');
    return manifest.map(r => _path.resolve(_appRoot, r.file));
  } catch(e) {
    console.error('[manifest] failed:', e.message, '| path:', _manifestPath);
    return [];
  }
}`;

c = c.slice(0, start) + newFn + c.slice(end);
writeFileSync(file, c, 'utf8');
console.log('Done');
