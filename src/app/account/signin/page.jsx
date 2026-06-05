import { useState } from "react";
import useAuth from "@/utils/useAuth";

export default function SigninPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const { signInWithCredentials } = useAuth();

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithCredentials({ email, password, callbackUrl: "/" });
    } catch (err) {
      setError(err.message || "Invalid email or password. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 50%, #0a1628 100%)",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Logo + Title */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            width: "88px", height: "88px",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            <img src="/icon.png" alt="AfyaCore" style={{ width: "60px", height: "60px", objectFit: "contain" }} />
          </div>
          <h1 style={{ color: "#ffffff", fontSize: "28px", fontWeight: "700", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
            AfyaCore HMS
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", margin: 0 }}>
            Hospital Management System
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px",
          padding: "36px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          backdropFilter: "blur(12px)",
        }}>
          <h2 style={{ color: "#ffffff", fontSize: "20px", fontWeight: "600", margin: "0 0 24px" }}>
            Welcome back
          </h2>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "10px",
              padding: "12px 16px",
              color: "#fca5a5",
              fontSize: "13px",
              marginBottom: "20px",
            }}>
              {error}
            </div>
          )}

          <form onSubmit={onSubmit}>
            {/* Email */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: "500", marginBottom: "8px" }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                required
                placeholder="admin@clinic.com"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.06)",
                  border: focusedField === "email" ? "1px solid rgba(99,179,237,0.8)" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border 0.2s",
                  boxShadow: focusedField === "email" ? "0 0 0 3px rgba(99,179,237,0.15)" : "none",
                }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: "500", marginBottom: "8px" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.06)",
                  border: focusedField === "password" ? "1px solid rgba(99,179,237,0.8)" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border 0.2s",
                  boxShadow: focusedField === "password" ? "0 0 0 3px rgba(99,179,237,0.15)" : "none",
                }}
              />
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px",
                background: loading ? "rgba(59,130,246,0.5)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                border: "none",
                borderRadius: "10px",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 16px rgba(37,99,235,0.4)",
                transition: "opacity 0.2s",
                letterSpacing: "0.3px",
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: "12px", marginTop: "24px" }}>
          AfyaCore · Licensed Software · Contact your administrator for access
        </p>
      </div>
    </div>
  );
}
