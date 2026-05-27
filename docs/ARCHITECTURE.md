# AfyaCore HMS — Complete Technical Documentation

## Enterprise Hospital Management System v1.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Setup & Installation](#3-setup--installation)
4. [Database Architecture](#4-database-architecture)
5. [Authentication & RBAC](#5-authentication--rbac)
6. [Module Reference](#6-module-reference)
7. [API Reference](#7-api-reference)
8. [Sync Engine](#8-sync-engine)
9. [Audit System](#9-audit-system)
10. [Licensing System](#10-licensing-system)
11. [Security Blueprint](#11-security-blueprint)
12. [Deployment Guide](#12-deployment-guide)
13. [Backup & Recovery](#13-backup--recovery)
14. [Performance Tuning](#14-performance-tuning)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AfyaCore HMS Desktop App                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Electron Shell (chromium + node)                    │    │
│  │  ┌─────────────────┐  ┌────────────────────────┐    │    │
│  │  │  React 18 UI    │  │  Electron Main Process  │    │    │
│  │  │  React Router 7 │  │  (main.cjs)             │    │    │
│  │  │  Zustand Store  │  │  - App lifecycle        │    │    │
│  │  │  TanStack Query │  │  - IPC bridge           │    │    │
│  │  │  Recharts       │  │  - File dialogs         │    │    │
│  │  └────────┬────────┘  └──────────┬──────────────┘    │    │
│  │           │ HTTP/WS localhost    │                     │    │
│  │  ┌────────▼────────────────────▼──────────────────┐  │    │
│  │  │         Local Server (Hono + Node.js)            │  │    │
│  │  │  ┌──────────────┐  ┌────────────────────────┐  │  │    │
│  │  │  │  REST API    │  │  WebSocket Server       │  │  │    │
│  │  │  │  Port :8080  │  │  Port :8081             │  │  │    │
│  │  │  │  Auth MW     │  │  Real-time events       │  │  │    │
│  │  │  │  RBAC guards │  │  Live notifications     │  │  │    │
│  │  │  └──────┬───────┘  └────────────────────────┘  │  │    │
│  │  │         │                                        │  │    │
│  │  │  ┌──────▼─────────────────────────────────────┐ │  │    │
│  │  │  │  Service Layer                              │ │  │    │
│  │  │  │  AuthService | AuditLogger | SyncEngine     │ │  │    │
│  │  │  │  LicenseService | WsServer                  │ │  │    │
│  │  │  └──────┬──────────────────────────────────────┘ │  │    │
│  │  │         │                                        │  │    │
│  │  │  ┌──────▼──────────────────────────────────────┐ │  │    │
│  │  │  │  AfyaDatabase (sql.js + WAL mode)           │ │  │    │
│  │  │  │  Local SQLite file: afyacore.db             │ │  │    │
│  │  │  │  Auto-flush every 5s + on app close         │ │  │    │
│  │  │  └─────────────────────────────────────────────┘ │  │    │
│  │  └────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
             ↕ Optional sync over LAN/WAN
┌─────────────────────────────────────────────────────────────┐
│                     Other Hospital Branches                   │
│                   (identical architecture)                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Desktop runtime | Electron | Native perf, offline-first, Windows-primary |
| Database | SQLite (sql.js) + WAL | Zero-config, embedded, ACID, fast |
| API layer | Hono | Fastest JS framework, typed routes |
| State | Zustand | Lightweight, no boilerplate |
| Real-time | WebSockets (ws) | Low latency, works offline (local) |
| Auth | bcrypt + custom sessions | No external deps, hospital-grade |
| Sync | Vector clocks + change_log | Distributed, conflict-aware |

---

## 2. Project Structure

```
afyacore-hms/
├── electron/
│   ├── main.cjs              # Electron main process
│   └── preload.cjs           # Secure IPC bridge
├── src/
│   ├── lib/
│   │   ├── db/
│   │   │   ├── database.ts   # AfyaDatabase singleton
│   │   │   └── schema.sql    # Complete DB schema (27 sections)
│   │   ├── auth/
│   │   │   ├── auth-service.ts   # Login, sessions, MFA, passwords
│   │   │   └── rbac-seeder.ts    # All roles + permissions
│   │   ├── audit/
│   │   │   └── audit-logger.ts   # Immutable audit trail
│   │   ├── license/
│   │   │   └── license-service.ts # HW fingerprint, activation
│   │   ├── sync/
│   │   │   └── sync-engine.ts    # Multi-branch sync
│   │   └── cache/            # (future: in-memory caching)
│   ├── server/
│   │   ├── routes/
│   │   │   └── api.ts        # All Hono route handlers
│   │   └── websocket/
│   │       └── ws-server.ts  # Real-time WS server
│   └── app/
│       ├── app.tsx           # Router + auth guards
│       ├── stores/
│       │   └── index.ts      # Zustand stores + API client
│       ├── components/
│       │   └── layout/
│       │       └── MainLayout.tsx  # Sidebar + topbar
│       └── routes/
│           ├── login.tsx
│           ├── dashboard.tsx
│           ├── patients.tsx
│           ├── laboratory.tsx
│           ├── billing.tsx
│           └── audit.tsx
├── data/migrations/          # SQL migration files
├── docs/                     # This documentation
└── package.json
```

---

## 3. Setup & Installation

### Prerequisites
- Node.js 20+ LTS
- npm 10+
- Windows 10/11 (primary), macOS 12+, Ubuntu 20.04+

### Development Setup

```bash
# Clone the repo
git clone https://github.com/Wanjikumaina-Ai/afyacore-hms.git
cd afyacore-hms

# Install dependencies
npm install

# Copy sql.js wasm to public
cp node_modules/sql.js/dist/sql-wasm.wasm public/

# Seed permissions and default admin
npm run seed

# Start development (Vite + Electron)
npm run dev
```

### Default Credentials (CHANGE IMMEDIATELY)
```
Username: admin
Password: AfyaCore@2024!
```

### First-Time Setup Checklist
1. Launch app → Log in with admin credentials
2. Go to **Settings → License** → Activate your license key
3. Go to **Settings → Hospital** → Configure hospital name, logo, details
4. Go to **Administration → Branches** → Add your branch(es)
5. Go to **Administration → Users** → Create staff accounts
6. Go to **Settings → NHIF/Insurance** → Configure payment integrations
7. Go to **Inventory → Drug Catalog** → Import your formulary
8. Go to **Billing → Catalog** → Set up service prices

---

## 4. Database Architecture

### Schema Sections (27 tables groups)

| Section | Tables | Description |
|---|---|---|
| Licensing | system_config, license_info | License management & system config |
| Organization | hospitals, branches, departments | Org hierarchy |
| RBAC | roles, permissions, role_permissions | Access control |
| Users | users, staff_profiles, user_branch_access | Staff management |
| Patients | patients, patient_vitals, patient_medical_history | Patient records |
| Appointments | appointments | Scheduling |
| Visits/EMR | visits, clinical_notes, diagnoses, treatment_plans | Clinical encounters |
| Admissions | wards, beds, admissions, nursing_records | IPD management |
| ICU | icu_monitoring | Critical care |
| Theatre | theatres, surgical_bookings | Surgery management |
| Emergency | emergency_triage | ER workflow |
| Laboratory | lab_test_catalog, lab_requests, lab_request_items | Lab management |
| Radiology | radiology_equipment, radiology_requests | Imaging |
| Pharmacy | drug_catalog, pharmacy_inventory, prescriptions, prescription_items, pharmacy_transactions | Medication |
| Billing | billing_items_catalog, invoices, invoice_items, payments, insurance_claims | Finance |
| Accounting | chart_of_accounts, journal_entries, journal_lines | GL accounting |
| Payroll | payroll_periods, payroll_records, leave_requests, staff_attendance, staff_shifts | HR |
| Inventory | suppliers, inventory_items, stock_items, purchase_orders, purchase_order_items | Supply chain |
| Assets | assets, maintenance_records | Asset management |
| Communications | messages, notifications | Messaging |
| Sync | sync_log, sync_vector_clocks, change_log | Multi-branch |
| Audit | audit_logs | Immutable audit trail |
| Security | active_sessions, failed_login_attempts | Auth security |
| Analytics | analytics_daily_snapshots | Pre-computed KPIs |
| Portal | patient_portal_tokens | Patient self-service |
| Referrals | referrals | Inter-branch referrals |

### Critical Design Choices

**Audit Log Immutability:**
```sql
CREATE TRIGGER prevent_audit_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'Audit logs are immutable'); END;
CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'Audit logs are immutable'); END;
```

**Automatic Inventory via Trigger:**
```sql
-- Invoice balance auto-updates on payment insertion
CREATE TRIGGER trg_invoice_balance_on_payment AFTER INSERT ON payments ...
-- Bed status auto-updates on admission
CREATE TRIGGER trg_bed_on_admission AFTER INSERT ON admissions ...
```

**WAL Mode for Performance:**
```sql
PRAGMA journal_mode = WAL;     -- Write-Ahead Logging
PRAGMA cache_size = -64000;    -- 64MB cache
PRAGMA mmap_size = 268435456;  -- 256MB memory map
```

---

## 5. Authentication & RBAC

### Authentication Flow

```
Login Request
     │
     ├─→ Find user by username/email
     ├─→ Check account locked?
     ├─→ Verify bcrypt password (12 rounds)
     ├─→ MFA enabled? → Issue temp token → Verify TOTP
     ├─→ Create session (48-byte random token)
     ├─→ Load permissions into session
     └─→ Return AuthUser + sessionToken
```

### Permission Format
```
module:resource:action
e.g. finance:invoices:void
     clinical:admissions:create
     admin:audit:read
```

### Role Hierarchy

```
super_admin
├── hospital_director
│   └── branch_admin
│       ├── doctors (doctor, specialist, surgeon, dentist)
│       ├── nursing (nurse)
│       ├── diagnostics (lab_technician, radiologist)
│       ├── pharmacy (pharmacist)
│       ├── front_office (receptionist, registration_staff, appointment_officer)
│       ├── finance (finance_manager, accountant, billing_officer, insurance_officer, payroll_officer)
│       ├── hr (hr_manager)
│       ├── operations (operations_manager, inventory_manager, procurement_officer)
│       └── it (it_admin)
└── patient (self-service portal)
```

### Session Security
- Sessions expire after 30 minutes of inactivity
- Session extended on each API call
- Max 5 failed logins → account lock
- Account lock requires admin unlock
- Sessions are device-fingerprint bound
- MFA required for: super_admin, hospital_director, finance_manager

---

## 6. Module Reference

### Patients Module
- Register patients with full demographic, insurance, and medical background
- Patient number auto-generation: `AFC-XXXXXX`
- Allergy and chronic condition tracking
- NHIF/insurance linkage
- Patient portal support

### Appointments Module
- Book/reschedule/cancel appointments
- Doctor availability checking
- Reminder system (SMS/email)
- Type: OPD, Follow-up, Specialist, Emergency, Teleconsult

### Clinical (EMR) Module
- Visit/encounter creation (OPD, IPD, Emergency, Day Case)
- SOAP notes, progress notes, procedure notes
- ICD-10 diagnosis coding
- Treatment plan management
- Triage levels (1-5 Manchester)
- Clinical sign-off workflow

### Admissions (IPD) Module
- Ward/bed management with real-time status
- Admission with diagnosis and doctor assignment
- Nursing care records (intake/output, wound care, obs)
- ICU monitoring (GCS, ventilator, vasopressors)
- Length of stay calculation
- Discharge with condition and follow-up

### Theatre Module
- Surgical booking and scheduling
- Multi-surgeon/anaesthetist assignment
- Pre/intra/post-op documentation
- Swab and instrument count records
- Implant tracking
- Complication documentation

### Laboratory Module
- Test catalog (200+ common tests configurable)
- Request workflow: Requested → Specimen → Processing → Resulted → Verified
- STAT/Urgent/Routine urgency levels
- Reference ranges by gender
- Critical value flagging
- Result verification by senior staff
- CSV/PDF report generation

### Pharmacy Module
- Drug catalog with interactions and contraindications
- Prescription creation and dispensing workflow
- Batch and expiry tracking
- Reorder level alerts
- Drug substitution support
- FIFO dispensing (first expiring first)

### Billing Module
- Invoice creation with line items
- Payment recording (Cash, M-Pesa, Card, Insurance, NHIF)
- Partial payment tracking
- Insurance claims management
- Invoice voiding with reason trail
- Revenue reports

### HR Module
- Staff profiles with employment details
- Attendance (biometric-ready)
- Leave management (annual, sick, maternity, etc.)
- Shift scheduling
- Payroll with PAYE, NHIF, NSSF deductions
- KRA PIN tracking

---

## 7. API Reference

All endpoints require `Authorization: Bearer <token>` except `/auth/login`.

### Authentication
```
POST   /api/auth/login           Login
POST   /api/auth/verify-mfa      MFA verification
POST   /api/auth/logout          Logout
POST   /api/auth/change-password Change password
GET    /api/auth/me              Current user
```

### Patients
```
GET    /api/patients             List (paginated, searchable)
GET    /api/patients/:id         Get patient
POST   /api/patients             Register patient
PUT    /api/patients/:id         Update patient
GET    /api/patients/:id/vitals  Vital signs history
POST   /api/patients/:id/vitals  Record vitals
```

### Clinical
```
GET    /api/visits               List visits
POST   /api/visits               Start visit
POST   /api/visits/:id/notes     Add clinical note
POST   /api/visits/:id/diagnoses Add diagnosis
GET    /api/appointments         List appointments
POST   /api/appointments         Book appointment
```

### Admissions
```
GET    /api/admissions/beds      Bed status board
POST   /api/admissions           Admit patient
POST   /api/admissions/:id/discharge  Discharge patient
```

### Laboratory
```
GET    /api/lab/catalog          Test catalog
POST   /api/lab/requests         Create lab request
POST   /api/lab/requests/:id/results   Enter results
POST   /api/lab/requests/:id/verify    Verify results
```

### Pharmacy
```
POST   /api/prescriptions        Create prescription
POST   /api/prescriptions/:id/dispense  Dispense
```

### Billing
```
POST   /api/billing/invoices              Create invoice
POST   /api/billing/invoices/:id/payment  Record payment
POST   /api/billing/invoices/:id/void     Void invoice
```

### Analytics
```
GET    /api/analytics/dashboard   Dashboard KPIs + charts
GET    /api/analytics/kpis        Operational KPIs
```

### Audit
```
GET    /api/audit                 Search audit logs
GET    /api/audit/export          Export as CSV
GET    /api/audit/verify          Integrity check
```

### System
```
GET    /api/system/health         Health check
GET    /api/system/license        License status
POST   /api/system/license/activate  Activate license
GET    /api/system/license/fingerprint  HW fingerprint
POST   /api/system/backup         Create backup
```

---

## 8. Sync Engine

### How Multi-Branch Sync Works

```
Branch A                              Branch B
   │                                     │
   ├─ Local operations write to          │
   │   change_log table                  │
   │                                     │
   ├─ SyncEngine.buildSyncPayload()      │
   │   • Collect unsynced changes        │
   │   • Include vector clock            │
   │   • Compute SHA-256 checksum        │
   │                                     │
   ├──── POST /api/sync/push ───────────►│
   │     (payload + checksum)            │
   │                                     ├─ Verify checksum
   │                                     ├─ For each change:
   │                                     │  • Check if record exists
   │                                     │  • Resolve conflicts
   │                                     │  • Apply with strategy
   │                                     ├─ Update vector clocks
   │                                     └─ Return result
```

### Conflict Resolution Strategies

| Table | Strategy | Rationale |
|---|---|---|
| patient_vitals, nursing_records | Last-write-wins | Append-only time-series |
| patients, staff_profiles | Field-level merge | Preserve all data |
| clinical_notes, diagnoses | Remote timestamp wins | Doctor's device is authoritative |
| invoices, payments | Local wins | Financial data never overwritten |
| prescriptions | Remote wins | Clinical decisions propagate |

### Syncable vs Local-Only Tables

**Syncable:** patients, visits, prescriptions, lab requests, invoices, referrals, appointments, admissions, clinical notes

**Local-only:** audit_logs, active_sessions, pharmacy_inventory (each branch owns its stock), sync_log

---

## 9. Audit System

### What is Logged
- Every login, logout, failed login, MFA failure
- Every patient record viewed, created, updated
- Every clinical note, diagnosis, prescription
- Every lab request and result entry
- Every invoice, payment, void
- Every admission, discharge
- Every user created, locked, unlocked
- Every permission change
- Every backup, restore
- Every config change
- Every license activation

### Audit Log Structure
```typescript
{
  id: number,           // Auto-increment (ordering)
  event_id: string,     // UUID (unique reference)
  timestamp: string,    // ISO 8601 with subseconds
  user_id: string,
  username: string,
  user_role: string,
  branch_id: string,
  ip_address: string,
  device_fingerprint: string,
  session_id: string,
  action: string,       // e.g. PATIENT_UPDATED
  module: string,       // e.g. patients
  resource: string,     // e.g. patients
  resource_id: string,
  previous_values: JSON,  // Before state
  new_values: JSON,       // After state
  changed_fields: JSON,   // Array of field names
  status: success|failed|blocked,
  risk_level: low|medium|high|critical,
  checksum: string      // SHA-256 tamper detection
}
```

### Tamper Detection
Each audit log row has a SHA-256 checksum computed over all fields. The `/api/audit/verify` endpoint re-computes checksums for all records and reports any mismatch.

### Immutability
Database triggers `prevent_audit_update` and `prevent_audit_delete` raise an abort error if any UPDATE or DELETE is attempted on audit_logs.

---

## 10. Licensing System

### License Key Format
```
ACV1-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-...
```

### License Payload
```json
{
  "version": "ACV1",
  "hospitalName": "Nairobi General Hospital",
  "licenseType": "perpetual|subscription|trial",
  "maxBranches": 5,
  "maxUsers": 200,
  "features": ["pharmacy", "laboratory", "radiology", "insurance"],
  "issuedAt": "2024-01-01T00:00:00Z",
  "expiresAt": "2025-01-01T00:00:00Z",
  "hardwareFingerprint": "a1b2c3d4e5f6...",
  "issuerSignature": "sha256-hmac..."
}
```

### Security Layers
1. **HMAC-SHA256 signature** — cannot be generated without master secret
2. **Hardware fingerprint** — CPU model + cores + hostname + MAC addresses
3. **Tamper hash** — stored in DB, revalidated every 5 minutes
4. **Expiry check** — subscription licenses refuse to operate after expiry
5. **User/branch limits** — enforced before every creation

### Offline Activation
For air-gapped hospitals:
1. Run `afyacore.getHardwareFingerprint()` → get activation request code
2. Send code to AfyaCore support
3. Support generates license key bound to that fingerprint
4. Activate using the key in Settings → License

---

## 11. Security Blueprint

### Transport Security
- All local HTTP on localhost only (not exposed to network)
- WebSocket on localhost only
- Remote sync uses HTTPS with certificate pinning (planned)
- CSP headers prevent XSS

### Data Security
- Passwords: bcrypt, 12 rounds
- Session tokens: 48-byte CSPRNG hex
- License keys: HMAC-SHA256 signed
- Audit checksums: SHA-256
- Sensitive fields masked in audit logs (password_hash, mfa_secret)

### Access Control
- Role-based permissions (27 roles, 100+ permissions)
- Every API endpoint guarded by `requirePermission` middleware
- Permission checks cached in session object
- Branch-level data isolation

### Session Security
- 30-minute idle timeout (react-idle-timer)
- Device fingerprint bound sessions
- All sessions revoked on admin action
- Failed login lockout after 5 attempts

### HIPAA-Inspired Controls
- Minimum necessary access principle
- Complete audit trail
- Data encryption at rest (planned: SQLite encryption extension)
- Secure backup procedures
- User authentication and authorization
- Emergency access procedures (super admin override)

---

## 12. Deployment Guide

### Standalone Hospital (Single Branch)

```bash
# Build installer
npm run build:win

# Output: release/AfyaCore HMS-1.0.0-win-x64.exe
# Install on hospital server or admin PC
# All data stored in: C:\Users\<user>\AppData\Roaming\AfyaCore HMS\data\afyacore.db
```

### Multi-Branch Setup

```
                    ┌──────────────────┐
                    │  Central Server  │
                    │  (Branch HQ)     │
                    │  AfyaCore HMS    │
                    │  + Sync API      │
                    └─────────┬────────┘
                              │ LAN/VPN
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
       │  Branch A   │ │  Branch B   │ │  Branch C   │
       │  AfyaCore   │ │  AfyaCore   │ │  AfyaCore   │
       │  (offline)  │ │  (offline)  │ │  (offline)  │
       └─────────────┘ └─────────────┘ └─────────────┘
```

Each branch runs a full local AfyaCore instance. Sync happens:
- Automatically every 60 seconds when network is available
- Manually via Settings → Sync → Sync Now
- Works fully offline when network is down

### System Requirements

| Spec | Minimum | Recommended |
|---|---|---|
| OS | Windows 10 64-bit | Windows 11 64-bit |
| RAM | 4GB | 8GB+ |
| Storage | 20GB | 100GB+ SSD |
| CPU | Intel i3 / AMD Ryzen 3 | Intel i5+ / AMD Ryzen 5+ |
| Display | 1280×720 | 1920×1080 |
| Network | Optional | 100Mbps LAN for multi-branch |

---

## 13. Backup & Recovery

### Automatic Backup
- Database flushed to disk every 5 seconds
- OS-level file backup recommended daily

### Manual Backup (via app)
1. Go to **Settings → Backup**
2. Click **Create Backup**
3. Select destination folder
4. File saved as: `afyacore_backup_YYYY-MM-DDTHH-MM-SS.db`

### Manual Backup (via IPC)
```javascript
// In renderer process
const result = await window.afyacore.createBackup();
// Opens folder picker dialog
```

### Restore Procedure
1. Go to **Settings → Backup → Restore**
2. Select backup file
3. Confirm restore (will overwrite current data)
4. App will reload after restore

### Disaster Recovery Plan
1. **Hardware failure** → Install AfyaCore on new machine → Restore latest backup
2. **Ransomware** → Wipe machine → Install fresh → Restore from offsite backup
3. **Data corruption** → Stop app → Replace db file with backup → Restart
4. **Accidental deletion** → Restore from most recent backup → Replay changes from audit log

### Recommended Backup Strategy
- **Real-time**: db file flush every 5s (built-in)
- **Hourly**: Automated file copy to secondary local drive
- **Daily**: Copy to NAS/external drive
- **Weekly**: Offsite copy (encrypted USB, cloud storage)

---

## 14. Performance Tuning

### Database Optimization
```sql
PRAGMA journal_mode = WAL;       -- Concurrent reads + writes
PRAGMA cache_size = -64000;      -- 64MB page cache
PRAGMA mmap_size = 268435456;    -- 256MB memory-mapped I/O
PRAGMA synchronous = NORMAL;     -- Balance safety vs speed
PRAGMA temp_store = MEMORY;      -- Temp tables in RAM
```

### Key Indexes
All critical query paths are indexed:
- patients: patient_number, name, phone, national_id, branch
- visits: patient, doctor, date, status, branch
- audit_logs: user, timestamp, module, action
- invoices: patient, status, date
- pharmacy_inventory: expiry_date, drug_id

### Pagination
All list endpoints use `LIMIT ? OFFSET ?` pagination. Default page size: 25 records. Never load unbounded result sets.

### Audit Log Batching
Low-risk audit events are batched and written every 2 seconds. High-risk and critical events are written synchronously.

### WS Ping/Keep-alive
WebSocket connections ping every 25s, cleaned up on close.

---

## 15. Troubleshooting

### App won't start
```bash
# Check if ports are free
netstat -ano | findstr :8080
netstat -ano | findstr :8081

# Check Electron logs
# Windows: %APPDATA%\AfyaCore HMS\logs\main.log
```

### Database locked error
- Only one AfyaCore instance should run at a time
- If stuck: close app, wait 10s, reopen

### Login fails for all users
1. Check if DB has been initialized (setup_complete = '1' in system_config)
2. Run `npm run seed` to re-seed roles and create default admin

### License not activating
1. Verify hardware fingerprint matches what license was issued for
2. Check system clock is accurate
3. Try offline activation if online activation fails

### Sync not working
1. Verify both branches can reach each other on the network
2. Check sync_log table for error messages
3. Verify license allows multi-branch (maxBranches > 1)

### Audit integrity check fails
This is serious. It means:
1. Someone directly modified the database file
2. Or the db file was restored from a partial/corrupted backup

Action:
1. Immediately lock the system
2. Document which records are affected (from the verify endpoint)
3. Contact AfyaCore support
4. Do not use affected records for clinical decisions until investigated

---

## Appendix A: Tech Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Desktop | Electron | 33+ |
| Frontend | React | 18.3 |
| Routing | React Router | 7 |
| State | Zustand | 5 |
| Data fetching | TanStack Query | 5 |
| Charts | Recharts | 2.13 |
| API server | Hono | 4.5 |
| Database | sql.js (SQLite) | 1.12 |
| Auth | bcryptjs | 2.4 |
| WebSocket | ws | 8.18 |
| Build | Vite | 5.4 |
| Package | electron-builder | 25 |
| Testing | Vitest | 2.1 |
| Language | TypeScript | 5.5 |

---

*AfyaCore HMS v1.0.0 — Enterprise Hospital Management System*
*Built for large hospitals, healthcare chains, and national medical institutions*
