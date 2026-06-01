#!/usr/bin/env node
/**
 * scripts/generate-license.cjs
 *
 * AfyaCore HMS — License Key Generator
 * ─────────────────────────────────────
 * Run from the repo root:
 *   node scripts/generate-license.cjs "Nairobi General Hospital" 365
 *   node scripts/generate-license.cjs "Kenyatta National Hospital" 730
 *
 * Arguments:
 *   $1  Hospital name (required, wrap in quotes if it has spaces)
 *   $2  Validity in days (optional, default 365)
 *
 * KEEP THIS FILE PRIVATE. Never push it to a public repository.
 * The LICENSE_SECRET must match src/lib/license.ts exactly.
 */

'use strict';

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// MASTER SECRET — must be identical to the one in src/lib/license.ts
// ─────────────────────────────────────────────────────────────────────────────
const LICENSE_SECRET =
  'e8f999a73b1051b00aade44b4da93027127006c92eea6447546a9ce4b8e3d62257ef36f3fc823e668bc1656d50322efb';
// ─────────────────────────────────────────────────────────────────────────────

function generateKey(hospitalName, daysValid = 365) {
  if (!hospitalName || hospitalName.trim().length < 2) {
    console.error('ERROR: Hospital name must be at least 2 characters.');
    process.exit(1);
  }

  const name = hospitalName.trim();
  const issuedAt  = Date.now();
  const expiresAt = issuedAt + daysValid * 24 * 60 * 60 * 1000;

  // Build payload: compact JSON → base64url
  const payload = Buffer.from(
    JSON.stringify({ h: name, i: issuedAt, e: expiresAt })
  ).toString('base64url');

  // HMAC-SHA256 signature
  const sig = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(payload)
    .digest('base64url');

  // Combine: payload.sig, then chunk into groups of 8 for readability
  const raw  = `${payload}.${sig}`;
  const key  = 'AFYA-' + raw.match(/.{1,8}/g).join('-');

  const issuedStr  = new Date(issuedAt).toISOString().split('T')[0];
  const expiresStr = new Date(expiresAt).toISOString().split('T')[0];

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║         AfyaCore HMS — License Key                  ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Hospital : ${name.padEnd(40)} ║`);
  console.log(`║  Issued   : ${issuedStr.padEnd(40)} ║`);
  console.log(`║  Expires  : ${expiresStr.padEnd(40)} (${daysValid} days) ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  KEY:                                                ║');

  // Print key in chunks of 52 chars per line for readability
  const keyChunks = key.match(/.{1,52}/g) || [key];
  for (const chunk of keyChunks) {
    console.log(`║  ${chunk.padEnd(52)} ║`);
  }
  console.log('╚══════════════════════════════════════════════════════╝\n');

  return key;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const [,, hospitalName, daysArg] = process.argv;

if (!hospitalName) {
  console.error('Usage: node scripts/generate-license.cjs "Hospital Name" [days]');
  console.error('  e.g: node scripts/generate-license.cjs "Nairobi Hospital" 365');
  process.exit(1);
}

const days = parseInt(daysArg ?? '365', 10);
if (isNaN(days) || days < 1) {
  console.error('ERROR: Days must be a positive integer.');
  process.exit(1);
}

generateKey(hospitalName, days);
