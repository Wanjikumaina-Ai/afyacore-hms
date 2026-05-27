import { createHmac, createHash, randomBytes } from 'node:crypto';
import { networkInterfaces, cpus, hostname } from 'node:os';
import { db } from '../db/database';
import { auditLogger } from '../audit/audit-logger';

// ─── Constants ────────────────────────────────────────────────────────────────
const LICENSE_SECRET = 'AFYACORE-LICENSE-MASTER-SECRET-2024-CHANGE-IN-PROD';
const LICENSE_VERSION = 'ACV1';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LicensePayload {
  version: string;
  hospitalName: string;
  licenseType: 'perpetual' | 'subscription' | 'trial';
  maxBranches: number;
  maxUsers: number;
  features: string[];
  issuedAt: string;
  expiresAt: string | null;
  hardwareFingerprint: string;
  branchIds: string[];
  issuerSignature: string;
}

export interface LicenseStatus {
  valid: boolean;
  active: boolean;
  expired: boolean;
  tampered: boolean;
  hospitalName: string;
  licenseType: string;
  maxBranches: number;
  maxUsers: number;
  features: string[];
  expiresAt: string | null;
  daysRemaining: number | null;
  error?: string;
}

export interface HardwareFingerprint {
  cpuModel: string;
  cpuCores: number;
  hostname: string;
  macAddresses: string[];
  fingerprint: string;
}

// ─── LicenseService ───────────────────────────────────────────────────────────
export class LicenseService {
  private static instance: LicenseService;
  private cachedStatus: LicenseStatus | null = null;
  private cacheExpiry = 0;

  static getInstance(): LicenseService {
    if (!LicenseService.instance) LicenseService.instance = new LicenseService();
    return LicenseService.instance;
  }

  // ─── Hardware Fingerprint ────────────────────────────────────────────────
  getHardwareFingerprint(): HardwareFingerprint {
    const cpu = cpus()[0];
    const cpuModel = cpu?.model ?? 'unknown';
    const cpuCores = cpus().length;
    const host = hostname();

    const macs: string[] = [];
    const nets = networkInterfaces();
    for (const iface of Object.values(nets)) {
      for (const net of iface ?? []) {
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push(net.mac.toLowerCase());
        }
      }
    }
    macs.sort();

    const raw = `${cpuModel}|${cpuCores}|${host}|${macs.join(',')}`;
    const fingerprint = createHash('sha256').update(raw).digest('hex').substring(0, 32);

    return { cpuModel, cpuCores, hostname: host, macAddresses: macs, fingerprint };
  }

  // ─── License Generation (for license server use) ─────────────────────────
  generateLicenseKey(payload: Omit<LicensePayload, 'issuerSignature'>): string {
    const sigPayload = JSON.stringify({
      ...payload,
      version: LICENSE_VERSION,
    });
    const signature = createHmac('sha256', LICENSE_SECRET)
      .update(sigPayload)
      .digest('hex');

    const fullPayload: LicensePayload = {
      ...payload,
      version: LICENSE_VERSION,
      issuerSignature: signature,
    };

    const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

    // Format as readable key: ACV1-XXXX-XXXX-XXXX-XXXX
    const chunks: string[] = [];
    for (let i = 0; i < encoded.length; i += 8) {
      chunks.push(encoded.substring(i, i + 8).toUpperCase());
    }
    return `${LICENSE_VERSION}-${chunks.join('-')}`;
  }

  // ─── License Activation ──────────────────────────────────────────────────
  async activateLicense(licenseKey: string): Promise<LicenseStatus> {
    const hwFP = this.getHardwareFingerprint();

    try {
      // 1. Parse key
      const payload = this.parseLicenseKey(licenseKey);
      if (!payload) {
        await auditLogger.log({
          action: 'LICENSE_INVALID', module: 'license', resource: 'system',
          status: 'failed', riskLevel: 'critical', failureReason: 'Malformed license key',
        });
        return this.errorStatus('Invalid license key format');
      }

      // 2. Verify signature
      const { issuerSignature, ...sigData } = payload;
      const expectedSig = createHmac('sha256', LICENSE_SECRET)
        .update(JSON.stringify(sigData))
        .digest('hex');

      if (expectedSig !== issuerSignature) {
        await auditLogger.log({
          action: 'LICENSE_INVALID', module: 'license', resource: 'system',
          status: 'failed', riskLevel: 'critical', failureReason: 'Signature mismatch',
        });
        return this.errorStatus('License key is invalid or tampered');
      }

      // 3. Verify hardware fingerprint
      if (payload.hardwareFingerprint !== hwFP.fingerprint) {
        await auditLogger.log({
          action: 'LICENSE_INVALID', module: 'license', resource: 'system',
          status: 'failed', riskLevel: 'critical',
          failureReason: `HW fingerprint mismatch: expected=${payload.hardwareFingerprint} got=${hwFP.fingerprint}`,
        });
        return this.errorStatus(
          'This license is registered to a different machine. Contact support.',
        );
      }

      // 4. Check expiry
      if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
        return this.errorStatus('License has expired');
      }

      // 5. Store license
      const tamperHash = createHash('sha256')
        .update(licenseKey + hwFP.fingerprint + payload.issuedAt)
        .digest('hex');

      db.run(
        `INSERT OR REPLACE INTO license_info
         (license_key, hospital_name, license_type, max_branches, max_users,
          hardware_fingerprint, issued_at, expires_at, activated_at, last_verified,
          features, is_active, tamper_hash)
         VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),?,1,?)`,
        [
          licenseKey,
          payload.hospitalName,
          payload.licenseType,
          payload.maxBranches,
          payload.maxUsers,
          hwFP.fingerprint,
          payload.issuedAt,
          payload.expiresAt ?? null,
          JSON.stringify(payload.features),
          tamperHash,
        ],
      );

      db.run(
        `UPDATE system_config SET value = 'active' WHERE key = 'license_status'`,
      );

      await auditLogger.log({
        action: 'LICENSE_ACTIVATED', module: 'license', resource: 'system',
        status: 'success', riskLevel: 'high',
        newValues: { hospitalName: payload.hospitalName, licenseType: payload.licenseType },
      });

      this.cachedStatus = null; // Invalidate cache
      return this.buildStatus(payload);
    } catch (err) {
      return this.errorStatus('License activation failed: ' + (err as Error).message);
    }
  }

  // ─── License Validation ──────────────────────────────────────────────────
  validateLicense(): LicenseStatus {
    // Cache for 5 minutes
    if (this.cachedStatus && Date.now() < this.cacheExpiry) {
      return this.cachedStatus;
    }

    const license = db.findOne<{
      license_key: string; hospital_name: string; license_type: string;
      max_branches: number; max_users: number; hardware_fingerprint: string;
      issued_at: string; expires_at: string | null; is_active: number;
      features: string; tamper_hash: string;
    }>(`SELECT * FROM license_info WHERE is_active = 1 ORDER BY activated_at DESC LIMIT 1`);

    if (!license) {
      return this.errorStatus('No active license found');
    }

    const hwFP = this.getHardwareFingerprint();

    // Verify hardware still matches
    if (license.hardware_fingerprint !== hwFP.fingerprint) {
      return this.errorStatus('Hardware mismatch. License may have been moved illegally.');
    }

    // Verify tamper hash
    const expectedTamperHash = createHash('sha256')
      .update(license.license_key + hwFP.fingerprint + license.issued_at)
      .digest('hex');
    if (expectedTamperHash !== license.tamper_hash) {
      auditLogger.logSync({
        action: 'LICENSE_INVALID', module: 'license', resource: 'system',
        status: 'failed', riskLevel: 'critical', failureReason: 'Tamper detected in stored license',
      });
      return { ...this.errorStatus('License tamper detected. System locked.'), tampered: true };
    }

    // Check expiry
    const expired = !!license.expires_at && new Date(license.expires_at) < new Date();

    // Update last_verified
    db.run(`UPDATE license_info SET last_verified = datetime('now') WHERE is_active = 1`);

    let daysRemaining: number | null = null;
    if (license.expires_at) {
      daysRemaining = Math.max(
        0,
        Math.ceil((new Date(license.expires_at).getTime() - Date.now()) / 86_400_000),
      );
    }

    const status: LicenseStatus = {
      valid: !expired,
      active: !!license.is_active && !expired,
      expired,
      tampered: false,
      hospitalName: license.hospital_name,
      licenseType: license.license_type,
      maxBranches: license.max_branches,
      maxUsers: license.max_users,
      features: JSON.parse(license.features ?? '[]'),
      expiresAt: license.expires_at,
      daysRemaining,
    };

    this.cachedStatus = status;
    this.cacheExpiry = Date.now() + 5 * 60_000;
    return status;
  }

  hasFeature(feature: string): boolean {
    const status = this.validateLicense();
    if (!status.valid) return false;
    return status.features.includes(feature) || status.features.includes('*');
  }

  canAddBranch(): boolean {
    const status = this.validateLicense();
    if (!status.valid) return false;
    const current = db.count('branches', 'is_active = 1');
    return current < status.maxBranches;
  }

  canAddUser(): boolean {
    const status = this.validateLicense();
    if (!status.valid) return false;
    const current = db.count('users', 'is_active = 1');
    return current < status.maxUsers;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private parseLicenseKey(key: string): LicensePayload | null {
    try {
      // Strip prefix and dashes, decode
      const withoutPrefix = key.replace(/^ACV1-/, '');
      const encoded = withoutPrefix.replace(/-/g, '').toLowerCase();
      const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
      return JSON.parse(decoded) as LicensePayload;
    } catch {
      return null;
    }
  }

  private buildStatus(payload: LicensePayload): LicenseStatus {
    const expired = !!payload.expiresAt && new Date(payload.expiresAt) < new Date();
    const daysRemaining = payload.expiresAt
      ? Math.max(0, Math.ceil((new Date(payload.expiresAt).getTime() - Date.now()) / 86_400_000))
      : null;

    return {
      valid: !expired,
      active: !expired,
      expired,
      tampered: false,
      hospitalName: payload.hospitalName,
      licenseType: payload.licenseType,
      maxBranches: payload.maxBranches,
      maxUsers: payload.maxUsers,
      features: payload.features,
      expiresAt: payload.expiresAt,
      daysRemaining,
    };
  }

  private errorStatus(error: string): LicenseStatus {
    return {
      valid: false, active: false, expired: false, tampered: false,
      hospitalName: '', licenseType: '', maxBranches: 0, maxUsers: 0,
      features: [], expiresAt: null, daysRemaining: null, error,
    };
  }

  // Offline activation code (for air-gapped environments)
  generateOfflineActivationRequest(): string {
    const hwFP = this.getHardwareFingerprint();
    const payload = {
      fingerprint: hwFP.fingerprint,
      hostname: hwFP.hostname,
      cpuModel: hwFP.cpuModel,
      requestedAt: new Date().toISOString(),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
}

export const licenseService = LicenseService.getInstance();
