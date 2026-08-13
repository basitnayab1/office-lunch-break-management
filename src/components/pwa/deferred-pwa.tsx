"use client";

import dynamic from "next/dynamic";

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

/** Registers the service worker and shows the existing Install App control. */
export function DeferredPwa() {
  return (
    <>
      <PwaRegister />
      <PwaInstallHost />
    </>
  );
}
