"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PwaRegister = dynamic(
  () =>
    import("@/components/pwa/pwa-register").then((m) => ({
      default: m.PwaRegister,
    })),
  { ssr: false }
);

const PwaInstallHost = dynamic(
  () =>
    import("@/components/pwa/pwa-install-button").then((m) => ({
      default: m.PwaInstallHost,
    })),
  { ssr: false }
);

/** Defer PWA install/register JS until after hydration (login stays lighter). */
export function DeferredPwa() {
  const [local, setLocal] = useState(false);

  useEffect(() => {
    setLocal(
      window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
    );
  }, []);

  if (local) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  return (
    <>
      <PwaRegister />
      <PwaInstallHost />
    </>
  );
}
