/**
 * Original editorial guides for the KKTC job market.
 *
 * These are written for the site, not imported. A job board that only
 * republishes other people's listings has nothing of its own to rank with, and a
 * candidate arriving from a search for "KKTC'de iş nasıl bulunur" needs an
 * answer, not another list. Each guide is authored per language — the English
 * text is not a translation of the Turkish one.
 *
 * Nothing here is scraped and nothing is invented: every claim is either a fact
 * about how this platform works or general guidance a job seeker can act on.
 */

export type GuideSection = {
  heading: string;
  body: string[];
  /** Optional bullet list rendered after the body paragraphs. */
  list?: string[];
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  lead: string;
  readMinutes: number;
  updated: string;
  sections: GuideSection[];
};

export const GUIDE_UPDATED = "2026-11-04";
