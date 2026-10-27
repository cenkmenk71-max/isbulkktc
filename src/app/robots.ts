import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/server/config/app-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getAppBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
