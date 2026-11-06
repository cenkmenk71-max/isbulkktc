import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { getDefaultSocialImage, noIndexMetadata, openGraphLocales } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

/**
 * Page-level metadata for the four auth routes.
 *
 * Those routes are `noindex` and carry no metadata of their own, so without this
 * they inherit the locale layout's `Meta` block — the *home page* title,
 * description and social card. The tab then says "İşBul KKTC — KKTC ve Kuzey
 * Kıbrıs İş İlanları" on `/login`, and sharing a sign-in link unfurls it as the
 * home page. Each auth route now derives its own copy from the same translation
 * block the page body renders (`AccountPages.login.<audience>`, `.register`,
 * `.reset`, `.resetPassword`).
 *
 * The social image and `og:locale` come from the shared helpers in `@/lib/seo`
 * so an auth card can never drift from the rest of the site. The canonical is an
 * absolute **string**: a `URL` instance is treated by Next as a base and
 * re-resolved against the request pathname (see `src/lib/seo.ts`), which would
 * prefix the default locale onto an already-canonical URL.
 */
export function createAuthPageMetadata(input: {
  locale: AppLocale;
  /** Locale-independent route path, e.g. `/login`. */
  pathname: string;
  title: string;
  description: string;
}): Metadata {
  const baseUrl = getAppBaseUrl();
  const prefix = input.locale === routing.defaultLocale ? "" : `/${input.locale}`;
  const canonicalUrl = `${baseUrl.origin}${prefix}${input.pathname}`;
  const socialImage = getDefaultSocialImage(input.locale, baseUrl);
  // The headings are written as sentences ("Return to your candidate profile.")
  // because the page body renders them with a full stop. A document title is not
  // a sentence, so drop one trailing stop before composing it.
  const title = input.title.replace(/\.$/, "");

  return {
    title: { absolute: `${title} · İşBul KKTC` },
    description: input.description,
    // `noIndexMetadata` only carries `robots`, which is why the rest of the
    // metadata used to fall through to the layout.
    robots: noIndexMetadata.robots,
    // Next replaces `alternates` wholesale at the deepest segment that declares
    // it, so declaring `canonical` here would otherwise drop the layout's RSS
    // autodiscovery link from every auth page. Re-declare it beside the canonical.
    alternates: {
      canonical: canonicalUrl,
      types: { "application/rss+xml": "/feed.xml" },
    },
    openGraph: {
      title,
      description: input.description,
      url: canonicalUrl,
      siteName: "İşBul KKTC",
      type: "website",
      locale: openGraphLocales[input.locale],
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images: [{ url: socialImage.url, alt: socialImage.alt }],
    },
  };
}
