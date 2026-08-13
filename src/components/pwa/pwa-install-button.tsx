"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __biteStationDeferredInstall?: BeforeInstallPromptEvent;
  }
}

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = ua.includes("Mac") && "ontouchend" in document;
  return iOS || iPadOs;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function readCapturedPrompt() {
  if (typeof window === "undefined") return null;
  return window.__biteStationDeferredInstall ?? null;
}

/**
 * Shows Install App when beforeinstallprompt is available (Chrome/Edge/Android),
 * or Add-to-Home-Screen / browser-menu instructions when it is not.
 */
export function PwaInstallButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const ios = useMemo(() => isIosDevice(), []);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }

    setDeferred(readCapturedPrompt());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__biteStationDeferredInstall = promptEvent;
      setDeferred(promptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setShowHelp(false);
      window.__biteStationDeferredInstall = undefined;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const helpCopy = ios
    ? "Tap Share, then Add to Home Screen."
    : "In Chrome or Edge, open the browser menu and choose Install app / Install Bite Station. On iPhone or iPad, use Share → Add to Home Screen.";

  const helpPanel = (
    <div className="w-full max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 text-left shadow-[var(--shadow)]">
      <p className="text-sm font-semibold text-[var(--ink)]">Install App</p>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{helpCopy}</p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="md"
          variant="secondary"
          onClick={() => setShowHelp(false)}
        >
          Close
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );

  // Chrome / Edge / Android Chromium
  if (deferred) {
    return (
      <div className={cn("pointer-events-auto", className)}>
        <Button
          type="button"
          variant={compact ? "secondary" : "primary"}
          size={compact ? "md" : "lg"}
          className={
            compact
              ? undefined
              : "h-11 px-4 text-sm shadow-[0_12px_28px_rgba(15,106,90,0.28)] sm:h-14 sm:px-6 sm:text-base"
          }
          onClick={async () => {
            try {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === "accepted") {
                setInstalled(true);
              }
            } catch (err) {
              console.warn("[PWA] install prompt failed:", err);
              setShowHelp(true);
            } finally {
              setDeferred(null);
              window.__biteStationDeferredInstall = undefined;
            }
          }}
        >
          Install App
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("pointer-events-auto", className)}>
      {!showHelp ? (
        <Button
          type="button"
          variant="secondary"
          size={compact ? "md" : "lg"}
          className={compact ? undefined : "h-11 px-4 text-sm sm:h-14 sm:px-6 sm:text-base"}
          onClick={() => setShowHelp(true)}
        >
          Install App
        </Button>
      ) : (
        helpPanel
      )}
    </div>
  );
}

/** Fixed corner host so install is available without redesigning pages. */
export function PwaInstallHost() {
  return (
    <div className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-[60] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      <PwaInstallButton />
    </div>
  );
}
