"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LoginHero = dynamic(
  () =>
    import("@/components/auth/login-hero").then((m) => ({
      default: m.LoginHero,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="hidden bg-[var(--bg)] md:block md:h-56 lg:min-h-screen"
        aria-hidden
      />
    ),
  }
);

/**
 * Login hero is decorative and hidden on small screens.
 * Mount it only from tablet breakpoints up to avoid shipping
 * the background image + mockups on mobile first paint.
 */
export function LoginHeroDeferred() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!enabled) {
    return null;
  }

  return <LoginHero />;
}
