/**
 * src/app/account/setup/page.jsx
 *
 * First-run setup wizard — shown by electron/server/main.cjs when
 * setup_complete = '0'. Creates the hospital record + first super-admin.
 * Called by you (installer) on-site. No default credentials ever.
 *
 * Steps:
 *  1. License key   → validated via window.afyacore.license.activate()
 *  2. Hospital info → name, phone, address, NHIF code
 *  3. Admin account → username, email, password
 *  4. POST /auth/setup-admin → done → redirect to /account/signin
 */

import { useState } from 'react';

const STEPS = ['License', 'Hospital', 'Admin Account', 'Done'];

const s = {
  root: {
    minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '24px',
    background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  card: {
    width: '100%', maxWidth: '520px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px', padding: '40px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
  },
  logo: {
    textAlign: 'center', marginBottom: '32px',
  },
  logoIcon: {
    width: '72px', height: '72px', borderRadius: '20px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px',
  },
  h1: { color: '#fff', fontSize: '24px', fontWeight: '700', margin: '0 0 4px' },
  sub: { color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 },
  stepRow: {
    display: 'flex', gap: '0', marginBottom: '32px',
    borderRadius: '10px', overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  step: (active, done) => ({
    flex: 1, padding: '8px 4px', fontSize: '11px', fontWeight: '600',
    textAlign: 'center', letterSpacing: '0.3px',
    background: done ? 'rgba(16,185,129,0.2)' : active ? 'rgba(59,130,246,0.25)' : 'transparent',
    color: done ? '#34d399' : active ? '#93c5fd' : 'rgba(255,255,255,0.3)',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    transition: 'all 0.2s',
  }),
  h2: { color: '#fff', fontSize: '18px', fontWeight: '600', margin: '0 0 6px' },
  desc: { color: 'rgba(255,255,255,0.45)', fontSize: '13px', margin: '0 0 24px' },
  label: { display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '500', marginBottom: '6px' },
  input: (focused) => ({
    width: '100%', padding: '11px 14px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${focused ? 'rgba(99,179,237,0.8)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none',
    transition: 'border-color 0.2s',
  }),
  row: { marginBottom: '16px' },
  btn: (disabled) => ({
    width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
    background: disabled ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.9)',
    color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
    fontSize: '15px', fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s', marginTop: '8px',
  }),
  btnSecondary: {
    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', padding: '11px', color: 'rgba(255,255,255,0.5)',
    fontSize: '14px', cursor: 'pointer', width: '100%', marginTop: '8px',
  },
  err: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '10px', padding: '12px 16px',
    color: '#fca5a5', fontSize: '13px', marginBottom: '20px',
  },
  ok: {
    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: '10px', padding: '12px 16px',
    color: '#34d399', fontSize: '13px', marginBottom: '20px',
  },
  hint: { color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '4px' },
  doneIcon: { fontSize: '48px', textAlign: 'center', margin: '16px 0' },
  doneTitle: { color: '#34d399', fontSize: '20px', fontWeight: '700', textAlign: 'center', margin: '0 0 8px' },
  doneText: { color: 'rgba(255,255,255,0.5)', fontSize: '14px', textAlign: 'center', lineHeight: '1.6' },
  infoBox: {
    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
  },
  infoText: { color: 'rgba(255,255,255,0.6)', fontSize: '13px', lineHeight: '1.7', margin: 0 },
};

function Field({ label, value, onChange, type = 'text', placeholder, hint, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={s.row}>
      <label style={s.label}>{label}{required && <span style={{ color: '#f87171' }}> *</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={s.input(focused)}
        autoComplete="off"
        spellCheck={false}
      />
      {hint && <p style={s.hint}>{hint}</p>}
    </div>
  );
}

export default function SetupPage() {
  const [step, setStep]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Step 0 — license
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseInfo, setLicenseInfo] = useState(null);

  // Step 1 — hospital
  const [hospitalName, setHospitalName]       = useState('');
  const [hospitalPhone, setHospitalPhone]     = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [nhifCode, setNhifCode]               = useState('');

  // Step 2 — admin
  const [username, setUsername]   = useState('');
  const [email, setEmail]         = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');

  const clear = () => { setError(''); setSuccess(''); };

  // ── Step 0: Activate License ───────────────────────────────
  async function handleLicense() {
    clear();
    if (!licenseKey.trim()) { setError('Paste the license key to continue.'); return; }
    setLoading(true);
    try {
      // Activate via IPC (available in Electron context)
      const api = window.afyacore;
      if (!api?.license) {
        setError('Not running in Electron context. Cannot activate license.');
        setLoading(false);
        return;
      }
      const result = await api.license.activate(licenseKey.trim());
      if (!result?.valid && !result?.success) {
        setError(result?.error || 'Invalid license key. Contact AfyaCore support.');
        setLoading(false);
        return;
      }
      setLicenseInfo(result);
      // Pre-fill hospital name from license
      if (result.hospitalName && !hospitalName) setHospitalName(result.hospitalName);
      setSuccess(`License valid for: ${result.hospitalName || 'this facility'}`);
      setTimeout(() => { setSuccess(''); setStep(1); }, 1200);
    } catch (err) {
      setError(err.message || 'License activation failed.');
    }
    setLoading(false);
  }

  // ── Step 1: Hospital Info ──────────────────────────────────
  function handleHospital() {
    clear();
    if (!hospitalName.trim()) { setError('Hospital name is required.'); return; }
    setStep(2);
  }

  // ── Step 2: Admin Account + Final Submit ──────────────────
  async function handleAdmin() {
    clear();
    if (!username.trim() || !email.trim() || !firstName.trim() || !lastName.trim() || !password) {
      setError('All fields marked * are required.');
      return;
    }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username:        username.trim().toLowerCase(),
          email:           email.trim().toLowerCase(),
          password,
          firstName:       firstName.trim(),
          lastName:        lastName.trim(),
          hospitalName:    hospitalName.trim(),
          hospitalPhone:   hospitalPhone.trim() || undefined,
          hospitalAddress: hospitalAddress.trim() || undefined,
          nhifCode:        nhifCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Setup failed. Please try again.'); setLoading(false); return; }

      // Mark setup complete in Electron config
      if (window.afyacore?.server?.completeSetup) {
        await window.afyacore.server.completeSetup({
          hospitalName: hospitalName.trim(),
          licenseKey,
          licenseActivated: true,
        });
      }

      setStep(3);
    } catch (err) {
      setError(err.message || 'Network error during setup.');
    }
    setLoading(false);
  }

  function goToSignIn() {
    window.location.hash = '#/account/signin';
    window.location.reload();
  }

  return (
    <div style={s.root}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logo}>
          <div style={s.logoIcon}>
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="rgba(99,179,237,0.9)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5m0 0 3-2m-3 2-3-2" />
            </svg>
          </div>
          <h1 style={s.h1}>AfyaCore HMS</h1>
          <p style={s.sub}>System Setup · Run this on the server machine</p>
        </div>

        {/* Step indicator */}
        <div style={s.stepRow}>
          {STEPS.map((label, i) => (
            <div key={label} style={s.step(i === step, i < step)}>{label}</div>
          ))}
        </div>

        {error   && <div style={s.err}>{error}</div>}
        {success && <div style={s.ok}>{success}</div>}

        {/* ── Step 0: License ───────────────────────────── */}
        {step === 0 && (
          <>
            <h2 style={s.h2}>Activate License</h2>
            <p style={s.desc}>Paste the license key you received for this hospital.</p>
            <div style={{ ...s.infoBox }}>
              <p style={s.infoText}>
                💡 You generate license keys using <code style={{ color: '#93c5fd' }}>scripts/generate-license.cjs</code>.
                Each key is tied to the hospital name and has an expiry date.
              </p>
            </div>
            <div style={s.row}>
              <label style={s.label}>License Key <span style={{ color: '#f87171' }}>*</span></label>
              <textarea
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                placeholder="AFYA-XXXXXXXX-XXXXXXXX-..."
                rows={4}
                style={{
                  ...s.input(false), resize: 'none',
                  fontFamily: 'monospace', fontSize: '13px',
                }}
              />
            </div>
            <button style={s.btn(loading || !licenseKey.trim())} onClick={handleLicense} disabled={loading || !licenseKey.trim()}>
              {loading ? 'Validating…' : 'Validate & Continue →'}
            </button>
          </>
        )}

        {/* ── Step 1: Hospital Info ─────────────────────── */}
        {step === 1 && (
          <>
            <h2 style={s.h2}>Hospital Information</h2>
            <p style={s.desc}>Enter the details for this facility. Only Name is required.</p>
            <Field label="Hospital / Facility Name" value={hospitalName} onChange={setHospitalName}
              placeholder="Kenyatta General Hospital" required />
            <Field label="Phone Number" value={hospitalPhone} onChange={setHospitalPhone}
              placeholder="+254 700 000 000" />
            <Field label="Physical Address" value={hospitalAddress} onChange={setHospitalAddress}
              placeholder="Nairobi, Kenya" />
            <Field label="NHIF Facility Code" value={nhifCode} onChange={setNhifCode}
              placeholder="HF-XXXXX" hint="Optional — used for NHIF claims" />
            <button style={s.btn(!hospitalName.trim())} onClick={handleHospital} disabled={!hospitalName.trim()}>
              Continue →
            </button>
            <button style={s.btnSecondary} onClick={() => { clear(); setStep(0); }}>← Back</button>
          </>
        )}

        {/* ── Step 2: Admin Account ─────────────────────── */}
        {step === 2 && (
          <>
            <h2 style={s.h2}>Super-Admin Account</h2>
            <p style={s.desc}>This is the master account for this hospital. Hand credentials to the hospital admin.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="John" required />
              <Field label="Last Name"  value={lastName}  onChange={setLastName}  placeholder="Doe"  required />
            </div>
            <Field label="Username" value={username} onChange={setUsername}
              placeholder="admin" hint="Lowercase, no spaces" required />
            <Field label="Email Address" value={email} onChange={setEmail} type="email"
              placeholder="admin@hospital.co.ke" required />
            <Field label="Password" value={password} onChange={setPassword} type="password"
              placeholder="Min. 8 characters" required />
            <Field label="Confirm Password" value={confirm} onChange={setConfirm} type="password"
              placeholder="Repeat password" required />
            <button style={s.btn(loading)} onClick={handleAdmin} disabled={loading}>
              {loading ? 'Setting up…' : 'Complete Setup →'}
            </button>
            <button style={s.btnSecondary} onClick={() => { clear(); setStep(1); }}>← Back</button>
          </>
        )}

        {/* ── Step 3: Done ──────────────────────────────── */}
        {step === 3 && (
          <>
            <div style={s.doneIcon}>✅</div>
            <h2 style={s.doneTitle}>Setup Complete!</h2>
            <p style={s.doneText}>
              <strong style={{ color: '#fff' }}>{hospitalName}</strong> is ready.<br /><br />
              Staff machines should install <strong style={{ color: '#fff' }}>AfyaCore HMS Client</strong>
              {' '}and connect to this server's IP address.<br /><br />
              Sign in with the admin credentials you just created.
            </p>
            <div style={{ ...s.infoBox, marginTop: '24px' }}>
              <p style={{ ...s.infoText, textAlign: 'center' }}>
                📡 Staff connect to this machine's IP on port <strong style={{ color: '#93c5fd' }}>8080</strong>
              </p>
            </div>
            <button style={{ ...s.btn(false), background: 'rgba(16,185,129,0.8)', marginTop: '16px' }} onClick={goToSignIn}>
              Go to Sign In →
            </button>
          </>
        )}
      </div>
    </div>
  );
}