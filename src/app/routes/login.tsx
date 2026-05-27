import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../stores";

type Step = "credentials" | "mfa" | "change_password";

export default function LoginPage() {
  const { login, verifyMfa, changePassword, user, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("credentials");
  const [tempToken, setTempToken] = useState("");
  const [form, setForm] = useState({ username: "", password: "", mfaCode: "", newPassword: "", confirmPassword: "" });
  const [localError, setLocalError] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Already logged in
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    // Request browser notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();
    if (!form.username.trim() || !form.password.trim()) {
      setLocalError("Username and password are required");
      return;
    }
    try {
      const fp = await getDeviceFingerprint();
      const result = await login(form.username.trim(), form.password, fp);
      if (result.requiresMfa && result.tempToken) {
        setTempToken(result.tempToken);
        setStep("mfa");
      }
      // If mustChangePassword set by store, handled via useEffect above → route to dashboard first
    } catch {
      // error handled in store
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    if (form.mfaCode.length !== 6) {
      setLocalError("Enter the 6-digit code from your authenticator app");
      return;
    }
    try {
      await verifyMfa(tempToken, form.mfaCode);
    } catch (err) {
      setLocalError((err as Error).message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    if (form.newPassword !== form.confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }
    try {
      await changePassword(form.password, form.newPassword);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setLocalError((err as Error).message);
    }
  };

  const displayError = localError || error;

  return (
    <div style={s.page}>
      {/* Background pattern */}
      <div style={s.bgPattern} />

      <div style={s.card}>
        {/* Branding */}
        <div style={s.brand}>
          <div style={s.brandIcon}>⚕️</div>
          <h1 style={s.brandName}>
            <span style={{ color: "#10b981" }}>Afya</span>Core
          </h1>
          <p style={s.brandSub}>Enterprise Hospital Management System</p>
        </div>

        {/* ── Step: Credentials ── */}
        {step === "credentials" && (
          <form onSubmit={handleCredentials} style={s.form}>
            <h2 style={s.formTitle}>Sign In</h2>
            <p style={s.formSub}>Enter your hospital credentials to continue</p>

            <div style={s.field}>
              <label style={s.label}>Username or Email</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                style={s.input}
                placeholder="username or email@hospital.com"
                autoFocus
                autoComplete="username"
                disabled={isLoading}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Password</label>
              <div style={s.inputWrapper}>
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ ...s.input, paddingRight: 44 }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={s.eyeBtn}
                  tabIndex={-1}
                >
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {displayError && <div style={s.errorBox}>{displayError}</div>}

            <button type="submit" style={s.submitBtn} disabled={isLoading}>
              {isLoading ? <span style={s.spinner} /> : "Sign In →"}
            </button>

            <p style={s.forgotLink}>
              Forgot password? Contact your <strong>IT Administrator</strong>
            </p>
          </form>
        )}

        {/* ── Step: MFA ── */}
        {step === "mfa" && (
          <form onSubmit={handleMfa} style={s.form}>
            <div style={s.mfaIcon}>🔐</div>
            <h2 style={s.formTitle}>Two-Factor Authentication</h2>
            <p style={s.formSub}>Enter the 6-digit code from your authenticator app</p>

            <div style={s.mfaInputGroup}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={form.mfaCode}
                onChange={(e) => setForm({ ...form, mfaCode: e.target.value.replace(/\D/g, "") })}
                style={s.mfaInput}
                placeholder="000000"
                autoFocus
                disabled={isLoading}
              />
            </div>

            {displayError && <div style={s.errorBox}>{displayError}</div>}

            <button type="submit" style={s.submitBtn} disabled={isLoading || form.mfaCode.length !== 6}>
              {isLoading ? <span style={s.spinner} /> : "Verify →"}
            </button>
            <button type="button" onClick={() => setStep("credentials")} style={s.backBtn}>
              ← Back to login
            </button>
          </form>
        )}

        {/* ── Step: Change Password ── */}
        {step === "change_password" && (
          <form onSubmit={handleChangePassword} style={s.form}>
            <div style={s.mfaIcon}>🔑</div>
            <h2 style={s.formTitle}>Set New Password</h2>
            <p style={s.formSub}>Your password must be changed before continuing</p>

            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                style={s.input}
                placeholder="At least 8 characters"
                autoFocus
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Confirm New Password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                style={s.input}
                placeholder="Repeat password"
              />
            </div>

            <PasswordStrength password={form.newPassword} />

            {displayError && <div style={s.errorBox}>{displayError}</div>}

            <button type="submit" style={s.submitBtn} disabled={isLoading}>
              {isLoading ? <span style={s.spinner} /> : "Set Password →"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div style={s.cardFooter}>
          <span style={s.secureTag}>🔒 256-bit Encrypted • HIPAA-Compliant Architecture</span>
        </div>
      </div>
    </div>
  );
}

// ─── Password strength indicator ─────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
    { label: "Symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const colors = ["#ef4444", "#f97316", "#eab308", "#10b981"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  if (!password) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < score ? colors[score - 1] : "#e2e8f0", transition: "background 0.3s" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {checks.map((c) => (
          <span key={c.label} style={{ fontSize: 11, color: c.ok ? "#10b981" : "#94a3b8" }}>
            {c.ok ? "✓" : "○"} {c.label}
          </span>
        ))}
        {score > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: colors[score - 1] }}>
            {labels[score - 1]}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Device fingerprint ───────────────────────────────────────────────────────
async function getDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? "0",
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(components));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 32);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)", position: "relative", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" },
  bgPattern: { position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(59,130,246,0.15) 0%, transparent 50%)", pointerEvents: "none" },
  card: { background: "#fff", borderRadius: 20, padding: "40px 44px 28px", width: "100%", maxWidth: 460, boxShadow: "0 24px 80px rgba(0,0,0,0.35)", position: "relative", zIndex: 1 },
  brand: { textAlign: "center", marginBottom: 28 },
  brandIcon: { fontSize: 40, marginBottom: 8 },
  brandName: { fontSize: 32, fontWeight: 900, margin: 0, letterSpacing: -1 },
  brandSub: { color: "#64748b", fontSize: 13, margin: "6px 0 0", fontWeight: 500 },
  form: { display: "flex", flexDirection: "column", gap: 0 },
  formTitle: { fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" },
  formSub: { fontSize: 13, color: "#64748b", margin: "0 0 20px" },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  inputWrapper: { position: "relative" },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", transition: "border 0.2s", boxSizing: "border-box", color: "#0f172a", background: "#f8fafc" },
  eyeBtn: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 2 },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 14 },
  submitBtn: { padding: "12px", background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4, letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  forgotLink: { textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 14, marginBottom: 0 },
  backBtn: { background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, marginTop: 12, textAlign: "center" },
  mfaIcon: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  mfaInputGroup: { display: "flex", justifyContent: "center", marginBottom: 16 },
  mfaInput: { width: 160, padding: "14px", textAlign: "center", fontSize: 28, fontWeight: 700, letterSpacing: 12, border: "2px solid #3b82f6", borderRadius: 12, outline: "none", color: "#0f172a", background: "#eff6ff" },
  spinner: { width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" },
  cardFooter: { borderTop: "1px solid #f1f5f9", marginTop: 24, paddingTop: 16, textAlign: "center" },
  secureTag: { fontSize: 11, color: "#94a3b8" },
};
