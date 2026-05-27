import { useState, useEffect } from "react";

type Screen = "connect" | "testing" | "connected" | "error";

export default function ClientConnectScreen() {
  const [screen, setScreen]     = useState<Screen>("connect");
  const [host, setHost]         = useState("");
  const [port, setPort]         = useState("8080");
  const [nickname, setNickname] = useState("");
  const [testing, setTesting]   = useState(false);
  const [error, setError]       = useState("");
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [version, setVersion]   = useState("");

  useEffect(() => {
    window.afyacore?.getVersion().then(setVersion).catch(() => {});
    // Check if already configured
    window.afyacore?.client?.getConfig().then((cfg: any) => {
      if (cfg?.serverHost) {
        setHost(cfg.serverHost);
        setPort(String(cfg.serverPort || 8080));
        setNickname(cfg.serverNickname || "");
      }
    }).catch(() => {});
  }, []);

  const handleTest = async () => {
    setError(""); setTesting(true);
    try {
      const result = await window.afyacore?.client?.testConnection(host.trim(), Number(port));
      setTesting(false);
      if (result?.ok) {
        setServerInfo(result);
        setScreen("connected");
      } else {
        setError(`Cannot reach server at ${host}:${port}\n\n${result?.error || "No response from server."}\n\nCheck that:\n• The server PC is powered on\n• You are on the same network\n• The IP address is correct`);
      }
    } catch (e: any) {
      setTesting(false);
      setError(e.message);
    }
  };

  const handleConnect = async () => {
    setError(""); setTesting(true);
    try {
      const result = await window.afyacore?.client?.connectToServer({
        host: host.trim(),
        port: Number(port),
        nickname: nickname || host,
      });
      setTesting(false);
      if (!result?.success) {
        setError(result?.error || "Connection failed");
        setScreen("connect");
      }
      // On success, the main process reloads the window to the server URL
    } catch (e: any) {
      setTesting(false);
      setError(e.message);
    }
  };

  return (
    <div style={s.page}>
      {/* Background pattern */}
      <div style={s.bg} />

      <div style={s.container}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <div style={s.logoIcon}>⚕️</div>
          <h1 style={s.logoText}>
            <span style={{ color: "#10b981" }}>Afya</span>Core
          </h1>
          <p style={s.logoSub}>Hospital Management System</p>
          {version && <p style={s.ver}>v{version}</p>}
        </div>

        {/* ── Connect screen ── */}
        {(screen === "connect" || screen === "error") && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Connect to your hospital server</h2>
            <p style={s.cardDesc}>
              Enter the IP address of the AfyaCore server PC in your hospital.
              Ask your IT administrator or the person who set up AfyaCore.
            </p>

            <div style={s.field}>
              <label style={s.label}>Server IP Address</label>
              <input
                value={host}
                onChange={e => setHost(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTest()}
                style={s.input}
                placeholder="e.g. 192.168.1.10"
                autoFocus
                spellCheck={false}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>Port (default: 8080)</label>
                <input
                  value={port}
                  onChange={e => setPort(e.target.value)}
                  style={s.input}
                  placeholder="8080"
                />
              </div>
              <div style={{ ...s.field, flex: 2 }}>
                <label style={s.label}>Label (optional)</label>
                <input
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  style={s.input}
                  placeholder="e.g. Main Reception Server"
                />
              </div>
            </div>

            {error && (
              <div style={s.errorBox}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Connection failed</div>
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{error}</pre>
              </div>
            )}

            <button
              onClick={handleTest}
              disabled={!host.trim() || testing}
              style={{ ...s.btn, opacity: (!host.trim() || testing) ? 0.5 : 1 }}
            >
              {testing ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <span style={s.spinner} />
                  Testing connection...
                </span>
              ) : "Test Connection →"}
            </button>

            <div style={s.helpSection}>
              <div style={s.helpTitle}>How to find your server IP:</div>
              <div style={s.helpItem}>1. Go to the AfyaCore server PC (reception / IT room)</div>
              <div style={s.helpItem}>2. Look at the system tray — AfyaCore shows the IP address</div>
              <div style={s.helpItem}>3. Or run <code style={s.code}>ipconfig</code> in Command Prompt on the server PC</div>
              <div style={s.helpItem}>4. Look for IPv4 Address under your LAN adapter</div>
            </div>
          </div>
        )}

        {/* ── Connection confirmed ── */}
        {screen === "connected" && (
          <div style={s.card}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <h2 style={{ ...s.cardTitle, color: "#10b981" }}>Server found!</h2>
              <p style={s.cardDesc}>Successfully connected to the AfyaCore server.</p>
            </div>

            <div style={s.serverCard}>
              <div style={s.serverRow}>
                <span style={s.serverLabel}>Server IP</span>
                <code style={s.serverVal}>{host}:{port}</code>
              </div>
              <div style={s.serverRow}>
                <span style={s.serverLabel}>Status</span>
                <span style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>● Online</span>
              </div>
              {nickname && (
                <div style={s.serverRow}>
                  <span style={s.serverLabel}>Label</span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{nickname}</span>
                </div>
              )}
            </div>

            <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", margin: "12px 0 20px", lineHeight: 1.6 }}>
              This computer will always connect to this server.<br />
              You can change it later from the app settings.
            </p>

            {error && <div style={s.errorBox}>{error}</div>}

            <button onClick={handleConnect} disabled={testing} style={s.btn}>
              {testing ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <span style={s.spinner} />
                  Opening AfyaCore...
                </span>
              ) : "Open AfyaCore →"}
            </button>
            <button onClick={() => { setScreen("connect"); setError(""); setServerInfo(null); }} style={s.backBtn}>
              ← Use a different server
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={s.footer}>
          AfyaCore HMS — Powered by Compuera Solutions
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif", position: "relative", overflow: "hidden" },
  bg: { position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(59,130,246,0.08) 0%, transparent 60%)", pointerEvents: "none" },
  container: { width: "100%", maxWidth: 480, padding: "0 20px", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" },
  logoWrap: { textAlign: "center", marginBottom: 28 },
  logoIcon: { fontSize: 48, marginBottom: 4 },
  logoText: { fontSize: 32, fontWeight: 900, margin: 0, color: "#f8fafc", letterSpacing: -1 },
  logoSub: { color: "#64748b", fontSize: 13, margin: "4px 0 0" },
  ver: { color: "#334155", fontSize: 11, marginTop: 6 },
  card: { width: "100%", background: "#1e293b", borderRadius: 16, padding: "28px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: 0 },
  cardTitle: { fontSize: 18, fontWeight: 800, color: "#f8fafc", margin: "0 0 6px", textAlign: "center" },
  cardDesc: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 20 },
  field: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: "#64748b" },
  input: { padding: "10px 14px", background: "#0f172a", border: "1.5px solid #334155", borderRadius: 8, color: "#f8fafc", fontSize: 15, outline: "none", fontFamily: "monospace", letterSpacing: 0.5 },
  btn: { width: "100%", padding: "13px", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4 },
  backBtn: { width: "100%", padding: "10px", background: "none", color: "#475569", border: "1px solid #334155", borderRadius: 10, fontSize: 13, cursor: "pointer", marginTop: 10 },
  spinner: { width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" },
  errorBox: { background: "#2d0f0f", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 14px", color: "#fca5a5", fontSize: 12, marginBottom: 14 },
  helpSection: { marginTop: 20, padding: "14px 16px", background: "#0f172a", borderRadius: 10, border: "1px solid #1e293b" },
  helpTitle: { fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  helpItem: { fontSize: 12, color: "#64748b", lineHeight: 1.8 },
  code: { background: "#1e293b", padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", color: "#10b981" },
  serverCard: { background: "#0f172a", borderRadius: 10, padding: "14px 18px", border: "1px solid #334155" },
  serverRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e293b" },
  serverLabel: { fontSize: 12, color: "#475569" },
  serverVal: { fontSize: 13, color: "#10b981", fontFamily: "monospace" },
  footer: { fontSize: 11, color: "#1e293b", marginTop: 24 },
};
