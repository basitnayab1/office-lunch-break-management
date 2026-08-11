"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker.
 * Does not touch break timers/alarms — SW only caches static shell assets.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Avoid SW in local turbopack HMR noise unless production-like
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // Still register on localhost so installability can be tested with HTTPS tunnels / prod.
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (isLocalhost) {
          void reg.update();
        }
      } catch (err) {
        console.warn("[PWA] service worker registration failed:", err);
      }
    };

    void register();
  }, []);

  return null;
}
