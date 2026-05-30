/**
 * scripts/generate-route-manifest.mjs
 */
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root      = join(__dirname, '..');
const apiDir    = join(root, 'src', 'app', 'api');
const outFile   = join(root, 'build', 'client', 'route-manifest.json');

function scan(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...scan(full));
    } else if (entry === 'route.js') {
      results.push(full);
    }
  }
  return results;
}

function toHonoPath(filePath) {
  const rel      = relative(apiDir, filePath).replace(/\\/g, '/');
  const segments = rel.split('/').slice(0, -1);
  if (segments.length === 0) return '/';
  return '/' + segments.map(s => {
    if (s.startsWith('[...') && s.endsWith(']')) return `:${s.slice(4,-1)}{.+}`;
    if (s.startsWith('[') && s.endsWith(']'))    return `:${s.slice(1,-1)}`;
    return s;
  }).join('/');
}

const files = scan(apiDir);
const manifest = files.map(f => ({
  file:      relative(root, f).replace(/\\/g, '/'),
  honoPath:  toHonoPath(f),
}));

writeFileSync(outFile, JSON.stringify(manifest, null, 2));
console.log(`[manifest] wrote ${manifest.length} routes to build/server/route-manifest.json`);
manifest.forEach(r => console.log(`  ${r.honoPath} -> ${r.file}`));
