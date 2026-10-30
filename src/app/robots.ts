import type { MetadataRoute } from "next";
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
      disallow: ["/api/", "/auth/"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
