import type { AppLocale } from "@/i18n/routing";

import { deGuides } from "./de";
import { elGuides } from "./el";
import { enGuides } from "./en";
import { faGuides } from "./fa";
import { ruGuides } from "./ru";
import { trGuides } from "./tr";
import type { Guide } from "./types";

export type { Guide, GuideSection } from "./types";
export { GUIDE_UPDATED } from "./types";

const byLocale: Record<AppLocale, readonly Guide[]> = {
  tr: trGuides,
  en: enGuides,
  de: deGuides,
  ru: ruGuides,
  el: elGuides,
  fa: faGuides,
};

export function getGuides(locale: AppLocale): readonly Guide[] {
  return byLocale[locale];
}

export function getGuide(locale: AppLocale, slug: string): Guide | undefined {
  return byLocale[locale].find((guide) => guide.slug === slug);
}

/** Every guide slug (they are the same set in every locale), for routing. */
export function getGuideSlugs(): readonly string[] {
  return trGuides.map((guide) => guide.slug);
}
