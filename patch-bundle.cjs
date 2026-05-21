const fs = require('fs');
const path = require('path');

// Find the server bundle
const assetsDir = './build/server/assets';
const files = fs.readdirSync(assetsDir);
const indexFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));

if (!indexFile) {
  console.error('Could not find server bundle in', assetsDir);
  process.exit(1);
}

const filePath = path.join(assetsDir, indexFile);
console.log('Patching:', filePath);

let content = fs.readFileSync(filePath, 'utf8');

// Find the __dirname assignment in the compiled bundle
// Original: join(fileURLToPath(new URL(".", import.meta.url)), "../src/app/api")
// We replace it with: process.env.APP_ROOT ? join(process.env.APP_ROOT, "src/app/api") : join(fileURLToPath(new URL(".", import.meta.url)), "../src/app/api")

const oldPattern = /const __dirname\s*=\s*join\(fileURLToPath\(new URL\("\."\s*,\s*import\.meta\.url\)\)\s*,\s*"\.\.\/src\/app\/api"\)\.replace\([^)]+\)/;

const match = content.match(oldPattern);
if (!match) {
  console.log('Pattern not found, trying alternative search...');
  // Show context around src/app/api
  const idx = content.indexOf('src/app/api');
  if (idx === -1) {
    console.error('Could not find src/app/api in bundle');
    process.exit(1);
  }
  console.log('Context:', content.substring(idx - 100, idx + 100));
  process.exit(1);
}

console.log('Found pattern:', match[0]);

const replacement = `const __dirname = (process.env.APP_ROOT ? join(process.env.APP_ROOT, "src/app/api") : join(fileURLToPath(new URL(".", import.meta.url)), "../src/app/api")).replace(/\\\\/g, "/")`;

content = content.replace(oldPattern, replacement);
fs.writeFileSync(filePath, content);
console.log('Done — bundle patched successfully.');
