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

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (process.env.NODE_ENV !== "production" || isLocalhost) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .catch(() => undefined);
      return;
    }

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        void reg.update();
      } catch (err) {
        console.warn("[PWA] service worker registration failed:", err);
      }
    };

    void register();
  }, []);

  return null;
}
