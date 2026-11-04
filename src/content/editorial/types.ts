/**
 * Original editorial articles for the career-news section.
 *
 * This replaces an RSS aggregator that re-published other outlets' headlines and
 * linked back to them. Republished headlines are duplicate content Google will
 * not index, and the outbound links sent our own visitors to competing sites.
 * These articles are written for the site, per language, and never link out.
 *
 * Every claim is either a fact about how this platform works or general
 * guidance a job seeker or employer can act on. Nothing is invented, and no
 * figure is asserted that the site cannot stand behind.
 */

export type ArticleSection = {
  heading: string;
  body: string[];
  list?: string[];
};

export type Article = {
  slug: string;
  title: string;
  description: string;
  category: string;
  readMinutes: number;
  published: string;
  updated: string;
  sections: ArticleSection[];
};

export const ARTICLE_PUBLISHED = "2026-11-04";
export const ARTICLE_UPDATED = "2026-11-04";
