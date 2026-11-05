import type { AppLocale } from "@/i18n/routing";

import { deArticles } from "./de";
import { elArticles } from "./el";
import { enArticles } from "./en";
import { faArticles } from "./fa";
import { ruArticles } from "./ru";
import { trArticles } from "./tr";
import type { Article } from "./types";

export type { Article, ArticleSection } from "./types";
export { ARTICLE_PUBLISHED, ARTICLE_UPDATED } from "./types";

const byLocale: Record<AppLocale, readonly Article[]> = {
  tr: trArticles,
  en: enArticles,
  de: deArticles,
  ru: ruArticles,
  el: elArticles,
  fa: faArticles,
};

export function getArticles(locale: AppLocale): readonly Article[] {
  return byLocale[locale];
}

export function getArticle(locale: AppLocale, slug: string): Article | undefined {
  return byLocale[locale].find((article) => article.slug === slug);
}

/** Every article slug (the same set in every locale), for routing. */
export function getArticleSlugs(): readonly string[] {
  return trArticles.map((article) => article.slug);
}
