import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

// next-pwa's service-worker generation hooks into webpack's compiler, but
// Next 16 defaults to Turbopack, which never runs it — the build silently
// produces no service worker under Turbopack. `npm run build` passes
// `--webpack` explicitly for this reason (see package.json); `next dev`
// stays on Turbopack since the service worker is disabled in dev anyway.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const apiOrigin = new URL(API_BASE_URL).origin;

const withPWA = withPWAInit({
  dest: "public",
  // Service workers fight hot-reload and cache stale JS during development —
  // standard next-pwa guidance is dev-off, verify via a production build.
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      // Auth and billing/cart calls touch live stock counts, session state,
      // and atomic invoice numbering — must always hit the network, never a
      // stale cache. (The billing page also skips these calls outright while
      // offline; this is a defense-in-depth backstop.)
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.origin === apiOrigin && (url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/carts")),
        handler: "NetworkOnly",
      },
      // Product catalog: try the network first (fresh stock/prices), fall
      // back to the last successful response when offline.
      {
        urlPattern: ({ url }: { url: URL }) => url.origin === apiOrigin && url.pathname.startsWith("/api/products"),
        handler: "NetworkFirst",
        options: {
          cacheName: "retake-products-api",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
      // Everything else under /api — network-first safety net.
      {
        urlPattern: ({ url }: { url: URL }) => url.origin === apiOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkFirst",
        options: { cacheName: "retake-api", networkTimeoutSeconds: 4 },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  // Tells Turbopack (used by `next dev`) to proceed despite the webpack
  // config next-pwa injects above — that config only matters for the
  // `--webpack` production build; the service worker is disabled in dev.
  turbopack: {},
};

export default withPWA(nextConfig);
