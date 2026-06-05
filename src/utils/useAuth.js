import { useCallback } from "react";
const API_BASE = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://localhost:8080' : '';

function useAuth() {
  const signInWithCredentials = useCallback(async (options) => {
    const res = await fetch(`${API_BASE}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signin", email: options.email, password: options.password }),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign in failed");
    window.location.href = options.callbackUrl || "/";
  }, []);

  const signOut = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
      credentials: "include",
    });
    window.location.href = "/account/signin";
  }, []);

  const signUpWithCredentials = useCallback(() => { console.warn("signUpWithCredentials disabled."); }, []);
  const signInWithGoogle = useCallback(() => console.warn("Google OAuth disabled."), []);
  const signInWithFacebook = useCallback(() => console.warn("Facebook OAuth disabled."), []);
  const signInWithTwitter = useCallback(() => console.warn("Twitter OAuth disabled."), []);
  const signInWithApple = useCallback(() => console.warn("Apple OAuth disabled."), []);

  return { signInWithCredentials, signUpWithCredentials, signOut, signInWithGoogle, signInWithFacebook, signInWithTwitter, signInWithApple };
}

export default useAuth;