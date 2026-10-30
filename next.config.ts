import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Restricts where the browser may load resources from. `unsafe-inline` is
// required for the inline hydration bootstrap and inline styles Next emits;
// everything else is locked to the app origin plus the third parties the site
// actually talks to (Turnstile, Google Analytics, Supabase).
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.challenges.cloudflare.com https://static.cloudflareinsights.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://cloudflareinsights.com https://challenges.cloudflare.com https://*.challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://*.challenges.cloudflare.com",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Do not advertise the framework through the X-Powered-By response header.
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  experimental: {
    agentUpgrade: "security",
  },
  images: {
    qualities: [75, 85, 90, 95, 100],
    formats: ["image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.isbulkibris.com",
        port: "",
        pathname: "/api/employer/logo/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "innovia-iskibris.s3.eu-west-2.amazonaws.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "www.yeniduzen.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "yeniduzen.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "www.kibristime.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "kibristime.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "www.kibrisgazetesi.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "kibrisgazetesi.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "brtk.net",
        port: "",
        pathname: "/**",
        search: "",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // The Vercel deployment aliases serve the same app outside Cloudflare,
        // so they must not be indexed: the canonical host is isbulkktc.com.
        source: "/(.*)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
