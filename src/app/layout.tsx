import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { PwaInstallHost } from "@/components/pwa/pwa-install-button";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  applicationName: "Bite Station",
  title: {
    default: "Bite Station",
    template: "%s · Bite Station",
  },
  description:
    "Bite Station — track and manage employee lunch breaks with timed alarms and office reporting.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bite Station",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
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
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        {children}
        <PwaRegister />
        <PwaInstallHost />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
