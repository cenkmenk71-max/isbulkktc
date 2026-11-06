import type { AppLocale } from "@/i18n/routing";

import de from "@/messages/de.json";
import el from "@/messages/el.json";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import ru from "@/messages/ru.json";
import tr from "@/messages/tr.json";

/**
 * The interface catalogs, shared by the machine-readable brief and the JSON-LD
 * producers so both name a page exactly as the page and the navigation name it.
 *
 * Everything the AI surface renders is generated for all six locales, so a
 * label hardcoded in Turkish (or English) would contradict the product's own
 * copy on five of them. Reading the catalog is the single source of truth; no
 * copy is authored here.
 *
 * Imported only by server modules (the two `llms.txt` route handlers and the
 * JSON-LD producers, which every route mounts from a server component), so the
 * catalogs never reach the client bundle.
 */
export const catalogs = {
  tr: {
    DistrictPage: tr.DistrictPage,
    JobTypePage: tr.JobTypePage,
    HomeJobSearch: tr.HomeJobSearch,
    Nav: tr.Nav,
    Footer: { links: tr.Footer.links },
  },
  en: {
    DistrictPage: en.DistrictPage,
    JobTypePage: en.JobTypePage,
    HomeJobSearch: en.HomeJobSearch,
    Nav: en.Nav,
    Footer: { links: en.Footer.links },
  },
  de: {
    DistrictPage: de.DistrictPage,
    JobTypePage: de.JobTypePage,
    HomeJobSearch: de.HomeJobSearch,
    Nav: de.Nav,
    Footer: { links: de.Footer.links },
  },
  ru: {
    DistrictPage: ru.DistrictPage,
    JobTypePage: ru.JobTypePage,
    HomeJobSearch: ru.HomeJobSearch,
    Nav: ru.Nav,
    Footer: { links: ru.Footer.links },
  },
  el: {
    DistrictPage: el.DistrictPage,
    JobTypePage: el.JobTypePage,
    HomeJobSearch: el.HomeJobSearch,
    Nav: el.Nav,
    Footer: { links: el.Footer.links },
  },
  fa: {
    DistrictPage: fa.DistrictPage,
    JobTypePage: fa.JobTypePage,
    HomeJobSearch: fa.HomeJobSearch,
    Nav: fa.Nav,
    Footer: { links: fa.Footer.links },
  },
} as const satisfies Record<AppLocale, unknown>;

/** Fills a catalog template like `{type} Jobs` / `{district} İş İlanları`. */
export function fillTemplate(template: string, value: string): string {
  return template.replace(/\{[^}]+\}/g, value);
}
