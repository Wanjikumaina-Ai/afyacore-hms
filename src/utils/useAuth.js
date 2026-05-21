/**
 * REPLACE: apps/web/src/utils/useAuth.js
 *
 * Local auth hooks — replaces @auth/create/react
 * Drop-in: same export shape as original.
 */

import { useCallback } from "react";

function useAuth() {
  const signInWithCredentials = useCallback(async (options) => {
    const res = await fetch("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "signin",
        email: options.email,
        password: options.password,
      }),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign in failed");
    window.location.href = options.callbackUrl || "/";
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
      credentials: "include",
    });
    window.location.href = "/account/signin";
  }, []);

  // Unused in offline version — kept so existing pages don't break
  const signUpWithCredentials = useCallback(() => {
    console.warn(
      "signUpWithCredentials disabled in offline mode. Use admin panel to add users."
    );
  }, []);
  const signInWithGoogle = useCallback(
    () => console.warn("Google OAuth disabled in offline mode."),
    []
  );
  const signInWithFacebook = useCallback(
    () => console.warn("Facebook OAuth disabled."),
    []
  );
  const signInWithTwitter = useCallback(
    () => console.warn("Twitter OAuth disabled."),
    []
  );
  const signInWithApple = useCallback(
    () => console.warn("Apple OAuth disabled."),
    []
  );

  return {
    signInWithCredentials,
    signUpWithCredentials,
    signOut,
    signInWithGoogle,
    signInWithFacebook,
    signInWithTwitter,
    signInWithApple,
  };
}

export default useAuth;