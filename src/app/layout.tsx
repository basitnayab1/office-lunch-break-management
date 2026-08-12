import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Fraunces, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { DeferredPwa } from "@/components/pwa/deferred-pwa";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  preload: true,
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  preload: true,
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  applicationName: "//:ai",
  title: {
    default: "//:ai",
    template: "%s · //:ai",
  },
  description: "Smart breaks and workforce break management.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "//:ai",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/bite-station-logo-transparent.png", sizes: "961x594", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f6a5a",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          id="clear-local-pwa-cache"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  if (!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)) return;
                  var flag = 'bite-station-local-cache-reset-v2';
                  if (sessionStorage.getItem(flag) === '1') return;
                  sessionStorage.setItem(flag, '1');
                  var tasks = [];
                  if ('serviceWorker' in navigator) {
                    tasks.push(
                      navigator.serviceWorker.getRegistrations()
                        .then(function (regs) { return Promise.all(regs.map(function (reg) { return reg.unregister(); })); })
                        .catch(function () {})
                    );
                  }
                  if ('caches' in window) {
                    tasks.push(
                      caches.keys()
                        .then(function (keys) { return Promise.all(keys.map(function (key) { return caches.delete(key); })); })
                        .catch(function () {})
                    );
                  }
                  Promise.all(tasks).finally(function () {
                    window.location.reload();
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        {children}
        <DeferredPwa />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
