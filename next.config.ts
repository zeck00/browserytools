import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/tools/bg-removal",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }],
      },
      {
        // Apply specific headers to static assets
        source: "/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Apply headers to images
        source: "/(.*\\.(?:jpg|jpeg|gif|png|svg|ico|webp))",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/tools",
        destination: "/",
        permanent: true,
      },
    ];
  },
  productionBrowserSourceMaps: false,
  compress: true,
  // Optimize images
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.worklet\.(js|mjs)$/,
      // Scoped to @waveform-playlist/worklets only: its two processor files are
      // standalone (no imports/exports) and loaded via `new URL(..., import.meta.url)`,
      // which is what this asset/resource rule is for. Tone.js also ships files
      // named `*.worklet.js`, but those are regular ESM modules with named exports
      // (e.g. `workletName`) consumed via normal `import` — Tone loads its actual
      // worklet code at runtime from an inline Blob URL, not from this file. An
      // unscoped test matches Tone's files too, turning them into opaque asset
      // resources and breaking their named exports (webpack error: "Can't import
      // the named export 'workletName' ... only default export is available"),
      // which breaks the whole `tone` import graph (including for consumers that
      // never touch recording/worklets, e.g. `useExportWav`).
      include: /node_modules[\\/]@waveform-playlist[\\/]worklets/,
      type: "asset/resource",
      generator: { filename: "static/worklets/[name][ext]" },
    });
    return config;
  },
};

export default nextConfig;
