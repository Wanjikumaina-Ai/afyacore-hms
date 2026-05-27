import { useState, useEffect } from "react";

type Step = "welcome" | "license" | "hospital" | "admin" | "service" | "done";

interface SetupState {
  hospitalName: string;
  hospitalPhone: string;
  hospitalAddress: string;
  nhifCode: string;
  licenseKey: string;
  licenseStatus: any;
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  adminConfirm: string;
  firstName: string;
  lastName: string;
  registerService: boolean;
}

const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: "welcome",  label: "Welcome",    icon: "🏥" },
  { id: "license",  label: "License",    icon: "🔑" },
  { id: "hospital", label: "Hospital",   icon: "🏢" },
  { id: "admin",    label: "Admin User", icon: "👤" },
  { id: "service",  label: "Service",    icon: "⚙️"  },
  { id: "done",     label: "Complete",   icon: "✅" },
];

export default function ServerSetupWizard() {
  const [step, setStep] = useState<Step>("welcome");
  const [state, setState] = useState<SetupState>({
    hospitalName: "", hospitalPhone: "", hospitalAddress: "", nhifCode: "",
    licenseKey: "", licenseStatus: null,
    adminUsername: "admin", adminEmail: "", adminPassword: "", adminConfirm: "",
    firstName: "", lastName: "",
    registerService: true,
  });
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [hwFP, setHwFP]         = useState("");

  const set = (field: keyof SetupState, val: any) =>
    setState(s => ({ ...s, [field]: val }));

  useEffect(() => {
    // Load server info and hardware fingerprint
    window.afyacore?.server?.getInfo().then(setServerInfo).catch(() => {});
    window.afyacore?.license?.getFingerprint().then((r: any) => setHwFP(r?.fingerprint ?? "")).catch(() => {});
  }, []);

  const stepIndex = STEPS.findIndex(s => s.id === step);

  const validateLicense = async () => {
    if (!state.licenseKey.trim()) { setError("Enter your license key"); return; }
    setLoading(true); setError("");
    try {
      const result = await window.afyacore?.license?.activate(state.licenseKey.trim());
      if (result?.valid) {
        set("licenseStatus", result);
        setStep("hospital");
      } else {
        setError(result?.error ?? "License activation failed");
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const validateHospital = () => {
    if (!state.hospitalName.trim()) { setError("Hospital name is required"); return; }
    setError(""); setStep("admin");
  };

  const validateAdmin = () => {
    if (!state.firstName || !state.lastName) { setError("First and last name required"); return; }
    if (!state.adminEmail) { setError("Email required"); return; }
    if (state.adminPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(state.adminPassword)) { setError("Password needs an uppercase letter"); return; }
    if (!/[0-9]/.test(state.adminPassword)) { setError("Password needs a number"); return; }
    if (!/[^A-Za-z0-9]/.test(state.adminPassword)) { setError("Password needs a symbol"); return; }
    if (state.adminPassword !== state.adminConfirm) { setError("Passwords do not match"); return; }
    setError(""); setStep("service");
  };

  const finishSetup = async () => {
    setLoading(true); setError("");
    try {
      // Create admin user via API
      const resp = await fetch("/api/auth/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: state.adminUsername,
          email: state.adminEmail,
          password: state.adminPassword,
          firstName: state.firstName,
          lastName: state.lastName,
          hospitalName: state.hospitalName,
          hospitalPhone: state.hospitalPhone,
          hospitalAddress: state.hospitalAddress,
          nhifCode: state.nhifCode,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? "Setup failed");
      }

      // Register Windows service if requested
      if (state.registerService && process.platform === "win32") {
        await window.afyacore?.server?.registerService();
      }

      // Mark setup complete in Electron config
      const result = await window.afyacore?.server?.completeSetup({
        hospitalName: state.hospitalName,
        licenseKey: state.licenseKey,
        licenseActivated: true,
      });
      if (!result?.success) throw new Error(result?.error ?? "Failed to save setup");

      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <span style={{ color: "#10b981" }}>Afya</span>Core HMS
        </div>
        <div style={s.version}>Server Setup Wizard</div>
      </div>

      {/* Progress */}
      <div style={s.progress}>
        {STEPS.map((st, i) => (
          <div key={st.id} style={s.progressStep}>
            <div style={{
              ...s.stepDot,
              background: i < stepIndex ? "#10b981" : i === stepIndex ? "#3b82f6" : "#1e293b",
              color: i <= stepIndex ? "#fff" : "#475569",
              border: i === stepIndex ? "2px solid #60a5fa" : "2px solid transparent",
            }}>
              {i < stepIndex ? "✓" : st.icon}
            </div>
            <div style={{ ...s.stepLabel, color: i === stepIndex ? "#f8fafc" : "#475569" }}>
              {st.label}
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ ...s.stepLine, background: i < stepIndex ? "#10b981" : "#1e293b" }} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={s.card}>

        {/* ── Welcome ── */}
        {step === "welcome" && (
          <div style={s.stepContent}>
            <div style={s.stepIcon}>🏥</div>
            <h2 style={s.stepTitle}>Welcome to AfyaCore HMS</h2>
            <p style={s.stepDesc}>
              This wizard will set up AfyaCore on this server PC.<br />
              This machine will host the database and serve all staff computers on your hospital network.
            </p>
            {serverInfo && (
              <div style={s.infoBox}>
                <div style={s.infoRow}><span style={s.infoLabel}>Server IP</span><code style={s.infoVal}>{serverInfo.ip}:{serverInfo.port}</code></div>
                <div style={s.infoRow}><span style={s.infoLabel}>Hostname</span><code style={s.infoVal}>{serverInfo.hostname}</code></div>
                <div style={s.infoRow}><span style={s.infoLabel}>Platform</span><code style={s.infoVal}>{serverInfo.platform}</code></div>
                <div style={s.infoNote}>
                  Staff will connect their computers to: <strong>{serverInfo.ip}:{serverInfo.port}</strong>
                </div>
              </div>
            )}
            <div style={s.prereqs}>
              <div style={s.prereqTitle}>Before you continue, make sure:</div>
              {[
                "This PC is connected to the hospital's local network (LAN / WiFi)",
                "You have your AfyaCore license key from Compuera Solutions",
                "This PC will remain powered on during hospital operating hours",
                "You have the hospital's registration details ready",
              ].map(item => (
                <div key={item} style={s.prereqItem}>
                  <span style={{ color: "#10b981", marginRight: 8 }}>✓</span>{item}
                </div>
              ))}
            </div>
            <button onClick={() => setStep("license")} style={s.nextBtn}>
              Begin Setup →
            </button>
          </div>
        )}

        {/* ── License ── */}
        {step === "license" && (
          <div style={s.stepContent}>
            <div style={s.stepIcon}>🔑</div>
            <h2 style={s.stepTitle}>License Activation</h2>
            <p style={s.stepDesc}>Enter the license key provided by Compuera Solutions. This key is tied to your hospital and this machine.</p>

            {hwFP && (
              <div style={s.fpBox}>
                <div style={s.fpLabel}>Hardware fingerprint (for offline activation)</div>
                <code style={s.fpCode}>{hwFP}</code>
                <button onClick={() => navigator.clipboard?.writeText(hwFP)} style={s.copyBtn}>
                  Copy fingerprint
                </button>
              </div>
            )}

            <div style={s.field}>
              <label style={s.label}>License Key</label>
              <textarea
                value={state.licenseKey}
                onChange={e => set("licenseKey", e.target.value)}
                style={s.licenseInput}
                placeholder="ACV1-XXXXXXXX-XXXXXXXX-XXXXXXXX-..."
                rows={3}
                spellCheck={false}
              />
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.btnRow}>
              <button onClick={() => setStep("welcome")} style={s.backBtn}>← Back</button>
              <button onClick={validateLicense} disabled={loading} style={s.nextBtn}>
                {loading ? "Activating..." : "Activate License →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Hospital Info ── */}
        {step === "hospital" && (
          <div style={s.stepContent}>
            <div style={s.stepIcon}>🏢</div>
            <h2 style={s.stepTitle}>Hospital Information</h2>
            {state.licenseStatus && (
              <div style={s.successBox}>
                ✅ License activated for: <strong>{state.licenseStatus.hospitalName}</strong>
                <br />Max branches: {state.licenseStatus.maxBranches} · Max users: {state.licenseStatus.maxUsers}
              </div>
            )}
            <div style={s.formGrid}>
              <div style={s.field}>
                <label style={s.label}>Hospital Name *</label>
                <input value={state.hospitalName} onChange={e => set("hospitalName", e.target.value)} style={s.input} placeholder="e.g. Nairobi General Hospital" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Phone</label>
                <input value={state.hospitalPhone} onChange={e => set("hospitalPhone", e.target.value)} style={s.input} placeholder="+254..." />
              </div>
              <div style={{ ...s.field, gridColumn: "1 / -1" }}>
                <label style={s.label}>Address</label>
                <input value={state.hospitalAddress} onChange={e => set("hospitalAddress", e.target.value)} style={s.input} placeholder="Physical address" />
              </div>
              <div style={s.field}>
                <label style={s.label}>NHIF Code</label>
                <input value={state.nhifCode} onChange={e => set("nhifCode", e.target.value)} style={s.input} placeholder="NHIF facility code" />
              </div>
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.btnRow}>
              <button onClick={() => setStep("license")} style={s.backBtn}>← Back</button>
              <button onClick={validateHospital} style={s.nextBtn}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Admin User ── */}
        {step === "admin" && (
          <div style={s.stepContent}>
            <div style={s.stepIcon}>👤</div>
            <h2 style={s.stepTitle}>Create Administrator Account</h2>
            <p style={s.stepDesc}>This will be the first Super Admin for <strong>{state.hospitalName}</strong>. Keep these credentials safe — they control everything.</p>
            <div style={s.formGrid}>
              <div style={s.field}>
                <label style={s.label}>First Name *</label>
                <input value={state.firstName} onChange={e => set("firstName", e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Last Name *</label>
                <input value={state.lastName} onChange={e => set("lastName", e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Username</label>
                <input value={state.adminUsername} onChange={e => set("adminUsername", e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Email *</label>
                <input type="email" value={state.adminEmail} onChange={e => set("adminEmail", e.target.value)} style={s.input} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Password *</label>
                <input type="password" value={state.adminPassword} onChange={e => set("adminPassword", e.target.value)} style={s.input} placeholder="Min 8 chars, uppercase, number, symbol" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Confirm Password *</label>
                <input type="password" value={state.adminConfirm} onChange={e => set("adminConfirm", e.target.value)} style={s.input} />
              </div>
            </div>
            <PasswordStrength password={state.adminPassword} />
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.btnRow}>
              <button onClick={() => setStep("hospital")} style={s.backBtn}>← Back</button>
              <button onClick={validateAdmin} style={s.nextBtn}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Service ── */}
        {step === "service" && (
          <div style={s.stepContent}>
            <div style={s.stepIcon}>⚙️</div>
            <h2 style={s.stepTitle}>Windows Service Setup</h2>
            <p style={s.stepDesc}>
              Register AfyaCore as a Windows service so it starts automatically when this PC boots —
              even before anyone logs in. Highly recommended for production.
            </p>
            <div style={s.serviceCard}>
              <label style={s.serviceToggle}>
                <input
                  type="checkbox"
                  checked={state.registerService}
                  onChange={e => set("registerService", e.target.checked)}
                  style={{ width: 18, height: 18, marginRight: 10 }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: "#f8fafc", fontSize: 14 }}>
                    Register as Windows Service (recommended)
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                    AfyaCore will start automatically on boot. Staff can access the system immediately when they arrive.
                  </div>
                </div>
              </label>
            </div>
            <div style={s.infoBox}>
              <div style={s.infoRow}><span style={s.infoLabel}>Service name</span><code style={s.infoVal}>AfyaCoreHMSServer</code></div>
              <div style={s.infoRow}><span style={s.infoLabel}>Start type</span><code style={s.infoVal}>Automatic</code></div>
              <div style={s.infoRow}><span style={s.infoLabel}>Runs as</span><code style={s.infoVal}>Local System</code></div>
            </div>
            <div style={s.warningBox}>
              ⚠️ Requires administrator privileges. If this fails, you can register the service later from the system tray menu.
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.btnRow}>
              <button onClick={() => setStep("admin")} style={s.backBtn}>← Back</button>
              <button onClick={finishSetup} disabled={loading} style={s.nextBtn}>
                {loading ? "Finishing setup..." : "Complete Setup ✓"}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div style={{ ...s.stepContent, textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={s.stepTitle}>AfyaCore is Ready!</h2>
            <p style={s.stepDesc}>
              <strong>{state.hospitalName}</strong> is now set up on this server.
            </p>
            {serverInfo && (
              <div style={s.doneBox}>
                <div style={s.doneTitle}>Share this with staff</div>
                <div style={s.doneIP}>{serverInfo.ip}</div>
                <div style={s.donePort}>Port: {serverInfo.port}</div>
                <div style={s.doneNote}>
                  Staff install AfyaCore Client on their PCs and enter this IP address when prompted.
                </div>
              </div>
            )}
            <div style={{ ...s.infoBox, textAlign: "left", marginTop: 20 }}>
              <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: 8 }}>Admin credentials</div>
              <div style={s.infoRow}><span style={s.infoLabel}>Username</span><code style={s.infoVal}>{state.adminUsername}</code></div>
              <div style={s.infoRow}><span style={s.infoLabel}>Email</span><code style={s.infoVal}>{state.adminEmail}</code></div>
            </div>
            <button
              onClick={() => { window.location.href = "/#/login"; }}
              style={{ ...s.nextBtn, marginTop: 24, fontSize: 16 }}
            >
              Open AfyaCore Dashboard →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Password strength indicator ───────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: "8+ characters",  ok: password.length >= 8 },
    { label: "Uppercase",      ok: /[A-Z]/.test(password) },
    { label: "Number",         ok: /[0-9]/.test(password) },
    { label: "Symbol",         ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["#ef4444","#f97316","#eab308","#10b981"];
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < score ? colors[score-1] : "#1e293b" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: 11, color: c.ok ? "#10b981" : "#475569" }}>
            {c.ok ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f172a", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 40px" },
  header: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", borderBottom: "1px solid #1e293b" },
  logo: { fontSize: 22, fontWeight: 900, color: "#f8fafc", letterSpacing: -0.5 },
  version: { fontSize: 12, color: "#475569" },
  progress: { display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "28px 20px 0", width: "100%", maxWidth: 680 },
  progressStep: { display: "flex", flexDirection: "column", alignItems: "center", position: "relative", flex: 1 },
  stepDot: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, transition: "all 0.3s", zIndex: 1 },
  stepLabel: { fontSize: 10, marginTop: 6, fontWeight: 600, textAlign: "center" },
  stepLine: { position: "absolute", top: 18, left: "50%", width: "100%", height: 2, transition: "background 0.3s" },
  card: { width: "100%", maxWidth: 560, background: "#1e293b", borderRadius: 16, padding: 32, marginTop: 32, boxShadow: "0 24px 60px rgba(0,0,0,0.4)" },
  stepContent: { display: "flex", flexDirection: "column", gap: 0 },
  stepIcon: { fontSize: 40, textAlign: "center", marginBottom: 12 },
  stepTitle: { fontSize: 22, fontWeight: 800, color: "#f8fafc", textAlign: "center", margin: "0 0 8px" },
  stepDesc: { fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 1.6, marginBottom: 20 },
  field: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  label: { fontSize: 12, fontWeight: 600, color: "#94a3b8" },
  input: { padding: "10px 14px", background: "#0f172a", border: "1.5px solid #334155", borderRadius: 8, color: "#f8fafc", fontSize: 14, outline: "none" },
  licenseInput: { padding: "10px 14px", background: "#0f172a", border: "1.5px solid #334155", borderRadius: 8, color: "#10b981", fontSize: 13, fontFamily: "monospace", resize: "vertical", outline: "none" },
  infoBox: { background: "#0f172a", borderRadius: 10, padding: "14px 18px", border: "1px solid #1e293b", marginBottom: 16 },
  infoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #1e293b" },
  infoLabel: { fontSize: 12, color: "#64748b" },
  infoVal: { fontSize: 12, color: "#10b981", background: "#0a1628", padding: "2px 8px", borderRadius: 4 },
  infoNote: { fontSize: 12, color: "#64748b", marginTop: 8 },
  fpBox: { background: "#0f172a", borderRadius: 10, padding: 14, border: "1px solid #1e293b", marginBottom: 16 },
  fpLabel: { fontSize: 11, color: "#64748b", marginBottom: 6 },
  fpCode: { display: "block", fontSize: 11, color: "#10b981", wordBreak: "break-all", lineHeight: 1.8 },
  copyBtn: { background: "none", border: "1px solid #334155", color: "#64748b", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, marginTop: 8 },
  successBox: { background: "#0d2e1a", border: "1px solid #14532d", borderRadius: 8, padding: "12px 16px", color: "#86efac", fontSize: 13, marginBottom: 16, lineHeight: 1.6 },
  errorBox: { background: "#2d0f0f", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 12 },
  warningBox: { background: "#2d1f00", border: "1px solid #78350f", borderRadius: 8, padding: "10px 14px", color: "#fcd34d", fontSize: 12, marginBottom: 16, lineHeight: 1.5 },
  btnRow: { display: "flex", gap: 10, justifyContent: "space-between", marginTop: 8 },
  nextBtn: { flex: 1, padding: "12px", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  backBtn: { padding: "12px 20px", background: "none", color: "#64748b", border: "1px solid #334155", borderRadius: 10, fontSize: 14, cursor: "pointer" },
  prereqs: { background: "#0f172a", borderRadius: 10, padding: "14px 18px", marginBottom: 20, border: "1px solid #1e293b" },
  prereqTitle: { fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 },
  prereqItem: { fontSize: 13, color: "#94a3b8", padding: "4px 0", lineHeight: 1.5 },
  serviceCard: { background: "#0f172a", borderRadius: 10, padding: "14px 18px", border: "1px solid #334155", marginBottom: 16 },
  serviceToggle: { display: "flex", alignItems: "flex-start", gap: 0, cursor: "pointer" },
  doneBox: { background: "#0f172a", borderRadius: 14, padding: "24px", border: "2px solid #10b981", textAlign: "center", marginTop: 16 },
  doneTitle: { fontSize: 11, color: "#10b981", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  doneIP: { fontSize: 32, fontWeight: 900, color: "#10b981", fontFamily: "monospace" },
  donePort: { fontSize: 14, color: "#64748b", marginTop: 4 },
  doneNote: { fontSize: 12, color: "#64748b", marginTop: 10, lineHeight: 1.6 },
};
