import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getLocalizedPageUrl } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

const publicPages = [
  { pathname: "/", changeFrequency: "weekly", priority: 1 },
  { pathname: "/jobs", changeFrequency: "daily", priority: 0.9 },
  { pathname: "/companies", changeFrequency: "weekly", priority: 0.8 },
  { pathname: "/freelance", changeFrequency: "monthly", priority: 0.7 },
  { pathname: "/packages", changeFrequency: "monthly", priority: 0.7 },
  { pathname: "/about", changeFrequency: "monthly", priority: 0.6 },
  { pathname: "/blog", changeFrequency: "hourly", priority: 0.8 },
  { pathname: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { pathname: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/cookies", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/terms", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppBaseUrl();

  return publicPages.flatMap(({ pathname, changeFrequency, priority }) => {
    const languages = {
      ...Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
        ]),
      ),
      "x-default": getLocalizedPageUrl(
        routing.defaultLocale,
        pathname,
        baseUrl,
      ).toString(),
    };

    return routing.locales.map((locale) => ({
      url: getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
      alternates: { languages },
      changeFrequency,
      priority,
    }));
  });
}
