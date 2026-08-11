import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bite Station",
    short_name: "Bite Station",
    description:
      "Bite Station — track and manage employee lunch breaks with timed alarms and office reporting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#000000",
    theme_color: "#0f6a5a",
    lang: "en",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
