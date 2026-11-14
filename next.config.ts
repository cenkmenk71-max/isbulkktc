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
  // Next streams `<head>` metadata after the shell unless the user agent is
  // listed here. Its default list is built around the "Google-*" service
  // crawlers (Mediapartners-Google, AdsBot-Google, …) and so does NOT match
  // plain `Googlebot` — the only Google crawler that renders JavaScript. Every
  // `force-dynamic` route resolves `generateMetadata` asynchronously, so for
  // Googlebot the tags stream in and React intermittently appends them *after*
  // `</head>`, leaving a top-level `<link rel="canonical">` under `<body>`.
  // Google accepts `rel="canonical"` only inside `<head>`, so a fraction of
  // Googlebot fetches lose the canonical, robots, OpenGraph and hreflang tags.
  // This mirrors Next 16's default list verbatim and appends `Googlebot` so its
  // metadata is blocking-rendered into `<head>`. See
  // `docs/seo/SEO_IMPLEMENTATION_REPORT.md` §64.
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Googlebot/i,
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
    // The optimizer fetches `?url=` on the server, so without an allowlist a
    // relative same-origin path resolves to *any* route and the optimizer
    // returns that route's content (`/_next/image?url=%2Fblog` served HTML,
    // `%2Fapi%2Fbuild-info` JSON, `%2Fllms.txt` text). Every local image this app
    // optimizes lives under `/images/**` or `/logos/**`, so anything else is
    // rejected with 400 `INVALID_IMAGE_OPTIMIZE_REQUEST`. `search: ""` also
    // rejects a query string, closing the enumeration surface Next 16 warns
    // about. Statically imported images resolve to `/_next/static/media/**`,
    // which Next allowlists separately, so they are unaffected.
    //
    // The pattern also requires an image *extension* (`*.@(webp|png|jpg|jpeg|avif|svg)`).
    // A plain `/images/**` matched `%252e%252e` too: the matcher compares the
    // *encoded* path (`URL.pathname` keeps `%25`), while the fetch decodes it
    // once more, so `/images/%252e%252e/blog` matched the prefix but fetched
    // `/blog` (issue #356). No real image path ends in a non-image route, and no
    // route ends in an image extension, so gating on the extension rejects every
    // encoded traversal while keeping the images this app actually serves.
    localPatterns: [
      { pathname: "/images/**/*.@(webp|png|jpg|jpeg|avif|svg)", search: "" },
      { pathname: "/logos/**/*.@(webp|png|jpg|jpeg|avif|svg)", search: "" },
    ],
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
  async redirects() {
    // Canonicalise the `www` host to the apex. Cloudflare redirects `http` to
    // `https` but does not touch the host, and Vercel's domain-level "redirect
    // to apex" is off, so `www.isbulkktc.com` served the exact same 200 as the
    // apex — two indexable hosts for one site (issue #595). The page-level
    // canonical already points at the apex, but a host-level redirect is what
    // search engines actually consolidate on. 308 keeps the method and is what
    // the rest of the app uses for permanent moves.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www\\.isbulkktc\\.com" }],
        destination: "https://isbulkktc.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Every HTML route must be uncacheable at the shared layer. Next's ISR
        // default for a *prerendered* page is `s-maxage` +
        // `stale-while-revalidate` — a shared-cache directive — while the locale
        // middleware adds a per-request `NEXT_LOCALE` `Set-Cookie` to the same
        // response. `Vary` never lists `Cookie`, and Next overwrites any `Vary`
        // a config rule sets (verified: a `Vary: Cookie` rule here is dropped),
        // so the cache key cannot be corrected from this file. The only lever
        // left is to stop the shared layer caching HTML at all, exactly as the
        // dynamic routes already are. The matcher is the middleware's own
        // (`src/proxy.ts`), so the rule covers precisely the routes that receive
        // the cookie; file extensions, `_next/**`, `/api/**`, `/trpc` and
        // `/vercel` stay out so immutable asset caching is untouched. See
        // `docs/threat-model.md` (prerender cache headers) and issue #390.
        source: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // The service worker must never be cached stale. The origin already
        // sends `public, max-age=0, must-revalidate` for `/sw.js` (a Next public
        // asset), but Cloudflare's edge raised it to 30 days
        // (`max-age=2628000`) because the origin header is not "no-cache" — so a
        // new service worker (a `CACHE_VERSION` bump) could take days to reach a
        // PWA user, who keeps running the old one. `no-cache` makes the edge
        // revalidate on every request regardless of the zone's Browser Cache TTL
        // setting. See `docs/cloudflare.md` SW-01.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
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
