import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400",
        },
      ],
    },
  ],
};

export default nextConfig;
