/**
 * REPLACE: apps/web/src/utils/useUser.js
 *
 * Reads the local session — replaces Anything.xyz's useUser.
 * Same return shape: { data, loading, error }
 */

import { useState, useEffect } from "react";

export default function useUser() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/expo-web-success", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setData(json.user || null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}