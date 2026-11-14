import type { MetadataRoute } from "next";

/** Web app manifest: makes KING DAY installable on Android, desktop and (via Share → Add to Home Screen) iOS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KING DAY",
    short_name: "KING DAY",
    description: "Premium kids' electric jeeps, bikes, scooters and toys, plus doorstep service. Every child deserves a royal ride.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#4B0082",
    background_color: "#1A0F2E",
    lang: "en-IN",
    categories: ["shopping", "kids", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop", url: "/shop", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Book a service", url: "/book-service", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My account", url: "/account", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
