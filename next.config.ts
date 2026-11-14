import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Dev only: lets a second signed-in session (e.g. a test technician) run on
  // 127.0.0.1:3000 alongside the admin on localhost:3000.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // In local development, images load straight from Supabase. Some ISP networks
    // (NAT64/IPv6) make Supabase resolve to addresses the dev optimizer treats as
    // private and refuses. Production uses Cloudflare Images instead.
    unoptimized: process.env.NODE_ENV === "development",
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Supabase Storage public buckets (Phase 4)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Makes Cloudflare bindings available during `next dev`.
initOpenNextCloudflareForDev();
