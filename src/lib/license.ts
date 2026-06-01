/**
 * src/lib/license.ts
 *
 * Offline license key validation — no internet required.
 * Keys are generated with scripts/generate-license.cjs using the same secret.
 *
 * Key format:  AFYA-<base64url-payload>.<base64url-sig>
 * (split into groups of 8 with dashes for readability)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// MASTER SECRET — never change after first deployment or all issued keys break.
// Never push this file to a public repository.
// ─────────────────────────────────────────────────────────────────────────────
const LICENSE_SECRET =
  'e8f999a73b1051b00aade44b4da93027127006c92eea6447546a9ce4b8e3d62257ef36f3fc823e668bc1656d50322efb';
// ─────────────────────────────────────────────────────────────────────────────

export interface LicensePayload {
  h: string;  // hospital name
  i: number;  // issued-at ms
  e: number;  // expires-at ms
}

export interface LicenseResult {
  valid: boolean;
  hospitalName?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  error?: string;
}

export function validateLicenseKey(rawKey: string): LicenseResult {
  try {
    // Remove AFYA- prefix, then remove the readability dashes.
    // The payload and sig are joined by a literal '.' which we preserve.
    const stripped = rawKey.trim().replace(/^AFYA-/, '').replace(/-/g, '');

    const dotIdx = stripped.lastIndexOf('.');
    if (dotIdx === -1) return { valid: false, error: 'Invalid key format.' };

    const payload = stripped.slice(0, dotIdx);
    const providedSig = stripped.slice(dotIdx + 1);

    const expectedSig = crypto
      .createHmac('sha256', LICENSE_SECRET)
      .update(payload)
      .digest('base64url');

    // Pad to same length before timingSafeEqual to avoid length-leak
    const maxLen = Math.max(providedSig.length, expectedSig.length);
    const a = Buffer.from(providedSig.padEnd(maxLen, '\0'));
    const b = Buffer.from(expectedSig.padEnd(maxLen, '\0'));
    const sigMatch = crypto.timingSafeEqual(a, b) && providedSig === expectedSig;

    if (!sigMatch) return { valid: false, error: 'Invalid license key.' };

    const decoded: LicensePayload = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    if (Date.now() > decoded.e) {
      return {
        valid: false,
        error: `License expired on ${new Date(decoded.e).toLocaleDateString('en-KE')}.`,
      };
    }

    return {
      valid: true,
      hospitalName: decoded.h,
      issuedAt: new Date(decoded.i),
      expiresAt: new Date(decoded.e),
    };
  } catch {
    return { valid: false, error: 'Malformed license key.' };
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export interface StoredLicense {
  key: string;
  hospitalName: string;
  expiresAt: string;
  activatedAt: string;
}

function getLicensePath(): string {
  return path.resolve(process.cwd(), 'data', 'license.json');
}

export function readStoredLicense(): StoredLicense | null {
  try {
    const p = getLicensePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as StoredLicense;
  } catch {
    return null;
  }
}

export function saveLicense(key: string, result: LicenseResult): void {
  const p = getLicensePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const stored: StoredLicense = {
    key,
    hospitalName: result.hospitalName!,
    expiresAt: result.expiresAt!.toISOString(),
    activatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(p, JSON.stringify(stored, null, 2), 'utf8');
}

export function isLicensed(): {
  licensed: boolean;
  hospitalName?: string;
  error?: string;
} {
  const stored = readStoredLicense();
  if (!stored) return { licensed: false, error: 'No license activated.' };
  const result = validateLicenseKey(stored.key);
  if (!result.valid) return { licensed: false, error: result.error };
  return { licensed: true, hospitalName: stored.hospitalName };
}
