import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getAppBaseUrl } from "@/server/config/app-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getAppBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Only non-HTML infrastructure belongs here. Account pages (/login,
      // /register, /admin, /profile, ...) are deliberately *not* disallowed:
      // they already serve a `noindex` robots meta tag, and a Disallow would
      // stop crawlers from ever fetching the page and seeing that tag, which is
      // how a disallowed URL still ends up indexed (snippet-less) from inbound
      // links. Route handlers like the OAuth callback cannot carry a meta tag,
      // so those stay disallowed.
      //
      // `localePrefix: "as-needed"` serves the callback under every locale
      // prefix (`/en/auth/callback`, ...), so a bare `/auth/` rule would leave
      // the five prefixed copies crawlable. robots.txt has no wildcard in the
      // middle of a path, so each prefix is listed explicitly.
      disallow: [
        "/api/",
        // Cloudflare serves its email-obfuscation and challenge infrastructure
        // under `/cdn-cgi/`. The footer's obfuscated `mailto:` links point at
        // `/cdn-cgi/l/email-protection#<hash>`, which the origin answers with
        // 404 — so every crawl of a page with a contact link spends budget on
        // dead infrastructure URLs. Cloudflare's own guidance is to disallow
        // the prefix; nothing under it is real content.
        "/cdn-cgi/",
        "/auth/",
        ...routing.locales
          .filter((locale) => locale !== routing.defaultLocale)
          .map((locale) => `/${locale}/auth/`),
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
