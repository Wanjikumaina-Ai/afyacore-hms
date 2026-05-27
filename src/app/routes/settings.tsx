import { useState, useEffect } from "react";
import { api, useAuthStore } from "../stores";

export default function SettingsPage() {
  const { user, hasPermission } = useAuthStore();
  const [activeSection, setActiveSection] = useState("hospital");
  const [licenseStatus, setLicenseStatus] = useState<any>(null);
  const [hwFP, setHwFP] = useState<any>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [activationSuccess, setActivationSuccess] = useState(false);
  const [hospitalForm, setHospitalForm] = useState({ name: "", phone: "", email: "", address: "", city: "", county: "", registrationNumber: "", nhifCode: "" });
  const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<any>("/system/license").then(r => setLicenseStatus(r.license)).catch(() => {});
    api.get<any>("/system/license/fingerprint").then(r => setHwFP(r)).catch(() => {});
    api.get<any>("/system/config").then(r => setSystemConfig(r.config ?? {})).catch(() => {});
  }, []);

  const handleActivate = async () => {
    setActivationError(""); setActivating(true);
    try {
      await api.post("/system/license/activate", { licenseKey });
      const r = await api.get<any>("/system/license");
      setLicenseStatus(r.license);
      setActivationSuccess(true);
    } catch (err) {
      setActivationError((err as Error).message);
    } finally { setActivating(false); }
  };

  const handleBackup = async () => {
    try {
      if ((window as any).afyacore?.createBackup) {
        const result = await (window as any).afyacore.createBackup();
        if (result.success) alert(`✅ Backup created at: ${result.path}`);
        else alert(`❌ Backup failed: ${result.error}`);
      } else {
        await api.post("/system/backup", { destPath: "./backups" });
        alert("✅ Backup created in ./backups directory");
      }
    } catch (err) { alert(`❌ ${(err as Error).message}`); }
  };

  const sections = [
    { id: "hospital", label: "🏥 Hospital Info", perm: "admin:settings:read" },
    { id: "license", label: "🔑 License", perm: "admin:license:read" },
    { id: "security", label: "🔒 Security", perm: "admin:settings:read" },
    { id: "backup", label: "💾 Backup & Recovery", perm: "admin:settings:read" },
    { id: "notifications", label: "🔔 Notifications", perm: "admin:settings:read" },
    { id: "integrations", label: "🔌 Integrations", perm: "admin:settings:read" },
  ].filter(s => hasPermission(...(s.perm.split(":") as [string, string, string])));

  return (
    <div style={s.page}>
      <h1 style={s.title}>⚙️ Settings</h1>
      <div style={s.layout}>
        {/* Sidebar */}
        <div style={s.sideNav}>
          {sections.map(sec => (
            <button key={sec.id} onClick={() => setActiveSection(sec.id)} style={{ ...s.navItem, ...(activeSection === sec.id ? s.navItemActive : {}) }}>
              {sec.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={s.content}>
          {/* Hospital Info */}
          {activeSection === "hospital" && (
            <Section title="🏥 Hospital Information">
              <div style={s.formGrid}>
                <Field label="Hospital Name"><input value={hospitalForm.name} onChange={e => setHospitalForm({...hospitalForm, name: e.target.value})} style={s.inp} /></Field>
                <Field label="Registration Number"><input value={hospitalForm.registrationNumber} onChange={e => setHospitalForm({...hospitalForm, registrationNumber: e.target.value})} style={s.inp} /></Field>
                <Field label="NHIF Code"><input value={hospitalForm.nhifCode} onChange={e => setHospitalForm({...hospitalForm, nhifCode: e.target.value})} style={s.inp} /></Field>
                <Field label="Phone"><input value={hospitalForm.phone} onChange={e => setHospitalForm({...hospitalForm, phone: e.target.value})} style={s.inp} /></Field>
                <Field label="Email"><input type="email" value={hospitalForm.email} onChange={e => setHospitalForm({...hospitalForm, email: e.target.value})} style={s.inp} /></Field>
                <Field label="Address"><input value={hospitalForm.address} onChange={e => setHospitalForm({...hospitalForm, address: e.target.value})} style={s.inp} /></Field>
                <Field label="City"><input value={hospitalForm.city} onChange={e => setHospitalForm({...hospitalForm, city: e.target.value})} style={s.inp} /></Field>
                <Field label="County"><input value={hospitalForm.county} onChange={e => setHospitalForm({...hospitalForm, county: e.target.value})} style={s.inp} /></Field>
              </div>
              <button style={s.saveBtn}>Save Hospital Info</button>
            </Section>
          )}

          {/* License */}
          {activeSection === "license" && (
            <Section title="🔑 License Management">
              {/* Status */}
              {licenseStatus && (
                <div style={{ ...s.licenseCard, background: licenseStatus.active ? "#f0fdf4" : "#fef2f2", border: `1px solid ${licenseStatus.active ? "#bbf7d0" : "#fecaca"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: licenseStatus.active ? "#16a34a" : "#dc2626" }}>
                        {licenseStatus.active ? "✅ License Active" : "❌ License Inactive"}
                      </div>
                      {licenseStatus.hospitalName && <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{licenseStatus.hospitalName}</div>}
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                        Type: <strong>{licenseStatus.licenseType}</strong> ·
                        Max Branches: <strong>{licenseStatus.maxBranches}</strong> ·
                        Max Users: <strong>{licenseStatus.maxUsers}</strong>
                      </div>
                      {licenseStatus.expiresAt && (
                        <div style={{ fontSize: 12, marginTop: 4, color: licenseStatus.daysRemaining < 30 ? "#dc2626" : "#64748b" }}>
                          Expires: {new Date(licenseStatus.expiresAt).toLocaleDateString()} · {licenseStatus.daysRemaining} days remaining
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 40 }}>{licenseStatus.active ? "🔑" : "🔒"}</div>
                  </div>
                  {licenseStatus.features?.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {licenseStatus.features.map((f: string) => (
                        <span key={f} style={{ fontSize: 11, background: "#fff", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>✓ {f}</span>
                      ))}
                    </div>
                  )}
                  {licenseStatus.error && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{licenseStatus.error}</div>}
                </div>
              )}

              {/* Hardware fingerprint */}
              {hwFP && (
                <div style={s.fpCard}>
                  <div style={s.fpTitle}>🖥️ Hardware Fingerprint (for offline activation)</div>
                  <code style={s.fpCode}>{hwFP.fingerprint}</code>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
                    CPU: {hwFP.details?.cpuModel} · Cores: {hwFP.details?.cpuCores} · Host: {hwFP.details?.hostname}
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(hwFP.fingerprint)} style={s.copyBtn}>📋 Copy Fingerprint</button>
                </div>
              )}

              {/* Activate */}
              {hasPermission("admin", "license", "update") && (
                <div style={s.activateCard}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Activate License Key</div>
                  <textarea
                    value={licenseKey}
                    onChange={e => setLicenseKey(e.target.value)}
                    style={s.licenseInput}
                    placeholder="ACV1-XXXXXXXX-XXXXXXXX-XXXXXXXX-..."
                    rows={3}
                  />
                  {activationError && <div style={{ ...s.errorBox, marginTop: 8 }}>⚠️ {activationError}</div>}
                  {activationSuccess && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#16a34a", marginTop: 8 }}>✅ License activated successfully!</div>}
                  <button onClick={handleActivate} disabled={activating || !licenseKey.trim()} style={s.activateBtn}>
                    {activating ? "Activating..." : "🔑 Activate License"}
                  </button>
                </div>
              )}
            </Section>
          )}

          {/* Security */}
          {activeSection === "security" && (
            <Section title="🔒 Security Settings">
              <div style={s.settingsList}>
                <SettingRow label="Session Timeout" description="Minutes of inactivity before auto-logout">
                  <select style={s.inp} defaultValue={systemConfig.session_timeout_minutes ?? "30"}>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                    <option value="120">2 hours</option>
                  </select>
                </SettingRow>
                <SettingRow label="Max Failed Logins" description="Lock account after this many failed attempts">
                  <select style={s.inp} defaultValue={systemConfig.max_failed_logins ?? "5"}>
                    <option value="3">3 attempts</option>
                    <option value="5">5 attempts</option>
                    <option value="10">10 attempts</option>
                  </select>
                </SettingRow>
                <SettingRow label="Password Expiry" description="Force password change after this many days">
                  <select style={s.inp} defaultValue={systemConfig.password_expiry_days ?? "90"}>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                    <option value="180">180 days</option>
                    <option value="365">1 year</option>
                    <option value="0">Never</option>
                  </select>
                </SettingRow>
                <SettingRow label="MFA Required Roles" description="Roles that must use two-factor authentication">
                  <div style={{ fontSize: 12, color: "#64748b" }}>super_admin, hospital_director, finance_manager</div>
                </SettingRow>
                <SettingRow label="Audit Log Retention" description="Days to keep audit logs">
                  <select style={s.inp} defaultValue={systemConfig.audit_retention_days ?? "2555"}>
                    <option value="365">1 year</option>
                    <option value="730">2 years</option>
                    <option value="1825">5 years</option>
                    <option value="2555">7 years (recommended)</option>
                    <option value="0">Forever</option>
                  </select>
                </SettingRow>
              </div>
              <button style={s.saveBtn}>Save Security Settings</button>
            </Section>
          )}

          {/* Backup */}
          {activeSection === "backup" && (
            <Section title="💾 Backup & Recovery">
              <div style={s.backupCards}>
                <div style={s.backupCard}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>💾</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Create Backup</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                    Creates a complete snapshot of all hospital data. Save to external drive or network location.
                  </div>
                  <button onClick={handleBackup} style={s.backupBtn}>📥 Create Backup Now</button>
                </div>
                <div style={s.backupCard}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📤</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Restore from Backup</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                    ⚠️ Restoring will overwrite all current data. This cannot be undone.
                  </div>
                  <button
                    onClick={async () => {
                      if ((window as any).afyacore?.restoreBackup) {
                        const result = await (window as any).afyacore.restoreBackup();
                        if (result.success) alert("✅ Restored successfully. App will reload.");
                        else if (result.error !== "Cancelled") alert(`❌ ${result.error}`);
                      }
                    }}
                    style={{ ...s.backupBtn, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
                  >
                    📤 Restore from Backup
                  </button>
                </div>
              </div>
              <div style={s.backupTips}>
                <strong>💡 Backup Best Practices:</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>
                  <li>Database auto-flushes to disk every 5 seconds (built-in)</li>
                  <li>Create manual backups before major operations</li>
                  <li>Store backups in at least 2 locations (local + offsite)</li>
                  <li>Test restores monthly to verify backup integrity</li>
                  <li>For multi-branch: coordinate backups with all branches</li>
                  <li>Recommended retention: 7 years for medical records</li>
                </ul>
              </div>
            </Section>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <Section title="🔔 Notification Settings">
              <div style={s.settingsList}>
                <SettingRow label="Low Stock Alerts" description="Notify when drug inventory falls below reorder level">
                  <Toggle defaultChecked />
                </SettingRow>
                <SettingRow label="Expiring Drugs (30 days)" description="Alert for drugs expiring within 30 days">
                  <Toggle defaultChecked />
                </SettingRow>
                <SettingRow label="Lab Results Ready" description="Notify doctor when lab results are verified">
                  <Toggle defaultChecked />
                </SettingRow>
                <SettingRow label="Appointment Reminders" description="Send reminders 24h before appointments">
                  <Toggle defaultChecked />
                </SettingRow>
                <SettingRow label="Critical Lab Values" description="Immediate alert for critical lab results">
                  <Toggle defaultChecked />
                </SettingRow>
                <SettingRow label="Insurance Claim Status" description="Updates when insurance claim status changes">
                  <Toggle defaultChecked />
                </SettingRow>
              </div>
              <button style={s.saveBtn}>Save Notification Settings</button>
            </Section>
          )}

          {/* Integrations */}
          {activeSection === "integrations" && (
            <Section title="🔌 Integrations">
              {[
                { name: "NHIF API", desc: "Kenya National Hospital Insurance Fund", status: "not_configured", icon: "🏥" },
                { name: "M-Pesa Daraja API", desc: "Safaricom M-Pesa payment integration", status: "not_configured", icon: "📱" },
                { name: "SMS Provider (Africa's Talking)", desc: "SMS notifications and reminders", status: "not_configured", icon: "💬" },
                { name: "PACS / DICOM", desc: "Radiology image management", status: "not_configured", icon: "📡" },
                { name: "Biometric System", desc: "Fingerprint attendance tracking", status: "not_configured", icon: "👆" },
                { name: "Email (SMTP)", desc: "Email notifications and reports", status: "not_configured", icon: "✉️" },
              ].map(int => (
                <div key={int.name} style={s.integrationCard}>
                  <div style={{ fontSize: 28 }}>{int.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{int.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{int.desc}</div>
                  </div>
                  <button style={s.configBtn}>Configure</button>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={s.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}
function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{description}</div>
      </div>
      <div style={{ width: 180 }}>{children}</div>
    </div>
  );
}
function Toggle({ defaultChecked }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked ?? false);
  return (
    <button onClick={() => setOn(!on)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: on ? "#3b82f6" : "#e2e8f0", position: "relative", transition: "background 0.2s" }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  title: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 },
  layout: { display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" },
  sideNav: { background: "#fff", borderRadius: 14, padding: "8px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 2 },
  navItem: { padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b", borderRadius: 8, textAlign: "left" },
  navItemActive: { background: "#eff6ff", color: "#1d4ed8" },
  content: { background: "#fff", borderRadius: 14, padding: "28px 32px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  sectionTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 24px", paddingBottom: 12, borderBottom: "2px solid #f1f5f9" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 },
  inp: { width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none", boxSizing: "border-box" as const },
  saveBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  licenseCard: { borderRadius: 12, padding: "20px 24px", marginBottom: 20 },
  fpCard: { background: "#f8fafc", borderRadius: 12, padding: "16px 20px", marginBottom: 20, border: "1px solid #e2e8f0" },
  fpTitle: { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 },
  fpCode: { fontSize: 13, background: "#0f172a", color: "#10b981", padding: "8px 14px", borderRadius: 8, display: "block", wordBreak: "break-all" },
  copyBtn: { background: "#eff6ff", border: "none", color: "#3b82f6", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, marginTop: 10 },
  activateCard: { background: "#f8fafc", borderRadius: 12, padding: "20px 24px", border: "1px solid #e2e8f0" },
  licenseInput: { width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "monospace", resize: "vertical", background: "#fff", boxSizing: "border-box" as const },
  activateBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 12 },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" },
  settingsList: { display: "flex", flexDirection: "column", marginBottom: 20 },
  backupCards: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 },
  backupCard: { background: "#f8fafc", borderRadius: 12, padding: "24px", border: "1px solid #e2e8f0", textAlign: "center" },
  backupBtn: { padding: "10px 20px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  backupTips: { background: "#fffbeb", borderRadius: 10, padding: "16px 20px", border: "1px solid #fde68a", fontSize: 13 },
  integrationCard: { display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: "1px solid #f1f5f9" },
  configBtn: { padding: "7px 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
};
