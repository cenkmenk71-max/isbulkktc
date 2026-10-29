import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/server/config/app-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getAppBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated areas are already noindex and behind auth, but keeping
      // them out of robots.txt stops crawlers from probing the login redirects.
      disallow: [
        "/api/",
        "/admin",
        "/profile",
        "/company/dashboard",
        "/company/new",
        "/auth/",
        "/login",
        "/register",
        "/reset-password",
        "/forgot-password",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
