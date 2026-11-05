import type { AppLocale } from "@/i18n/routing";
import { resolveLocalizedSlugPathname } from "@/lib/localized-slug-pathnames";

/**
 * Slugs of the content families whose slug is translated per locale, in the
 * order the locale files declare them (`src/content/guides`, `src/content/editorial`).
 *
 * This is a *slug-only* copy, not the content. The language menu lives in a
 * client component that Next also renders on the server, so the link it emits
 * has to be correct in the SSR HTML as well — that is where a crawler, and a
 * reader without JavaScript, meets the dead `/en/rehber/<turkish-slug>` link.
 * Importing the full guide and article modules to read three slugs each adds
 * ~108 KB raw / ~39 KB gzip to the bundle of *every* page; this table is ~1 KB.
 * `language-links.test.ts` derives the same slugs from the content modules and
 * fails when the two drift, so the copy cannot go stale silently.
 */
const translatedSlugs = {
  rehber: {
    tr: [
      "kktc-is-bulma-rehberi",
      "kktc-cv-hazirlama-rehberi",
      "kktc-calisma-izni-ve-haklar",
    ],
    en: [
      "finding-a-job-in-northern-cyprus",
      "cv-guide-for-northern-cyprus",
      "work-permit-and-rights-in-northern-cyprus",
    ],
    de: [
      "arbeit-finden-in-nordzypern",
      "lebenslauf-ratgeber-nordzypern",
      "arbeitserlaubnis-und-rechte-nordzypern",
    ],
    ru: [
      "kak-najti-rabotu-na-severnom-kipre",
      "rezyume-dlya-severnogo-kipra",
      "razreshenie-na-rabotu-i-prava",
    ],
    el: [
      "evresi-ergasias-sti-voreia-kypro",
      "odigos-viografikou-gia-voreia-kypro",
      "adeia-ergasias-kai-dikaiomata",
    ],
    fa: [
      "yaf-tan-kar-dar-ghabres-shomali",
      "rahnamaye-resume-baraye-ghabres-shomali",
      "ejazeye-kar-va-hoquq-e-karkonan",
    ],
  },
  blog: {
    tr: [
      "kktc-is-piyasasi-guncel-gorunum",
      "kktc-isverenler-icin-ilan-rehberi",
      "kktc-yeni-mezun-is-arama",
    ],
    en: [
      "northern-cyprus-job-market-outlook",
      "how-to-post-a-job-in-northern-cyprus",
      "first-job-guide-for-graduates",
    ],
    de: [
      "arbeitsmarkt-nordzypern-ueberblick",
      "stellenanzeige-richtig-schreiben-nordzypern",
      "erster-job-ratgeber-absolventen",
    ],
    ru: [
      "rynok-truda-severnogo-kipra-obzor",
      "kak-napisat-vakansiyu-severnyj-kipr",
      "pervaya-rabota-dlya-vypusknikov",
    ],
    el: [
      "agora-ergasias-voreia-kypros",
      "pos-na-grapsete-apotelesmatiki-aggelia",
      "proti-douleia-gia-ptychioychoys",
    ],
    fa: [
      "bazar-kar-ghabres-shomali",
      "negareshe-agahi-kar-baraye-karfarmayan",
      "rahnamaye-avvalin-kar-baraye-faragh-tahsil",
    ],
  },
} as const satisfies Record<string, Record<AppLocale, readonly string[]>>;

export type TranslatedSlugFamily = keyof typeof translatedSlugs;

/** URL segment → its translated-slug family. */
const sectionToFamily: Record<string, TranslatedSlugFamily> = {
  rehber: "rehber",
  blog: "blog",
};

/** The manifest above, shaped for `resolveLocalizedSlugPathname`. */
export function slugSiblings(
  family: TranslatedSlugFamily,
  locale: AppLocale,
): readonly { slug: string }[] {
  return translatedSlugs[family][locale].map((slug) => ({ slug }));
}

/**
 * The pathname the language menu should link to when switching to `targetLocale`.
 *
 * `pathname` comes from `usePathname()`, so it is unprefixed but still carries
 * the *current* locale's slug (`/rehber/arbeit-finden-in-nordzypern`). Reusing
 * that verbatim under another locale produced URLs that 404, because guide and
 * article slugs are translated per locale (issue #144). Resolving the sibling
 * slug by position keeps the link on the page the reader is already viewing.
 *
 * Falls back to `pathname` — the menu's behaviour before this fix — when the
 * route is not a translated-slug family, when no locale owns the slug, or when
 * the target locale's list is uneven. A link that merely lacks a prefix still
 * resolves on click; a wrong sibling slug would open a different article.
 */
export function resolveLanguageHref(
  pathname: string,
  targetLocale: AppLocale,
): string {
  const [section, slug, ...rest] = pathname.split("/").filter(Boolean);
  const family = sectionToFamily[section];
  if (!family || !slug || rest.length > 0) return pathname;

  return (
    resolveLocalizedSlugPathname({
      section: `/${section}`,
      locale: targetLocale,
      slug,
      siblings: (locale) => slugSiblings(family, locale),
    }) ?? pathname
  );
}
