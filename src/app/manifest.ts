import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/server/config/app-url";

/**
 * Web app manifest for the installable app.
 *
 * `start_url` is `/`, so a home-screen launch lands on real content rather than
 * an install pitch. It is deliberately unprefixed: with `localePrefix:
 * "as-needed"` the default locale is served at `/`, and a visitor who switched
 * language is redirected by the i18n middleware on arrival.
 *
 * `id` is the stable identity. It is an absolute URL, which pins the app to the
 * production origin, so a deployment alias (`*.vercel.app`) cannot register as a
 * second, separately-installable app. Never change it after release: browsers
 * treat a different `id` as a different application.
 *
 * `scope` is `/` because the installed app navigates the whole product; the
 * shortcuts and the notification click handler all target in-scope routes.
 */
export default function manifest(): MetadataRoute.Manifest {
  // A build-time origin keeps the manifest static. `getAppBaseUrl()` throws in
  // production when the origin is unset, which is the same guard the canonical
  // URLs and sitemap use, so a misconfigured deploy fails the build instead of
  // shipping a manifest that points at localhost.
  const origin = getAppBaseUrl().origin;
  const absolute = (path: string) => new URL(path, origin).toString();

  return {
    id: absolute("/"),
    name: "İşBul KKTC",
    short_name: "İşBul",
    description:
      "Kuzey Kıbrıs'ta iş ve kariyer platformu: iş ilanlarını arayın, başvurun ve işveren panelinizi yönetin.",
    lang: "tr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // `standalone` is what every target browser implements; `display_override`
    // lists it first for platforms that support the richer keys, so the
    // behaviour is identical whether or not the override is understood.
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    theme_color: "#F5F2EB",
    background_color: "#F5F2EB",
    categories: ["business", "productivity", "jobs"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "İş ara",
        short_name: "İş ara",
        description: "Açık iş ilanlarını ara",
        url: "/jobs",
      },
      {
        name: "Başvurularım",
        short_name: "Başvurular",
        description: "Başvuru durumunu görüntüle",
        url: "/profile/dashboard",
      },
      {
        name: "İşveren paneli",
        short_name: "Panel",
        description: "Şirket ilanlarını ve başvurularını yönet",
        url: "/company/dashboard",
      },
    ],
  };
}
