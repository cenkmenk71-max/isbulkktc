import type { VisualTarget } from "./support/visual";

const desktop = { width: 1280, height: 900 } as const;
const mobile = { width: 390, height: 844 } as const;

/**
 * The screens the visual gate guards, one entry per baseline image.
 *
 * Every entry is an element capture (`locator.screenshot`) rather than a
 * full-page shot, so a change below the fold cannot move a target and the
 * baseline stays small enough to commit. Each one is a surface the issue named
 * as critical or a shared layout region a design change would touch:
 *
 *  - the home hero copy, once per locale, so a locale-specific font or RTL
 *    regression is attributable to that locale;
 *  - the home job search form and the footer, the two shared layout pieces;
 *  - the jobs listing controls and a result card;
 *  - a job detail's header and its apply aside;
 *  - the login form and the package catalogue grid;
 *  - the 404 page.
 */
export const visualTargets: VisualTarget[] = [
  {
    name: "home-hero-copy-tr",
    route: "/",
    selector: "div.hero-copy",
    viewport: desktop,
    description: "Home hero copy, default locale (unprefixed URL)",
  },
  {
    name: "home-hero-copy-en",
    route: "/en",
    selector: "div.hero-copy",
    viewport: desktop,
    description: "Home hero copy, Latin (English)",
  },
  {
    name: "home-hero-copy-ru",
    route: "/ru",
    selector: "div.hero-copy",
    viewport: desktop,
    description: "Home hero copy, Cyrillic (Russian)",
  },
  {
    name: "home-hero-copy-el",
    route: "/el",
    selector: "div.hero-copy",
    viewport: desktop,
    description: "Home hero copy, Greek",
  },
  {
    name: "home-hero-copy-fa",
    route: "/fa",
    selector: "div.hero-copy",
    viewport: desktop,
    description: "Home hero copy, RTL (Persian)",
  },
  {
    name: "home-hero-copy-de",
    route: "/de",
    selector: "div.hero-copy",
    viewport: desktop,
    description: "Home hero copy, longest strings (German)",
  },
  {
    name: "home-hero-copy-mobile",
    route: "/",
    selector: "div.hero-copy",
    viewport: mobile,
    description: "Home hero copy at a 390px mobile viewport",
  },
  {
    name: "home-job-search-form",
    route: "/",
    selector: "form.home-job-search-form",
    viewport: desktop,
    description: "Home job search controls",
  },
  {
    name: "site-footer",
    route: "/",
    selector: "footer",
    viewport: desktop,
    description: "Shared site footer",
  },
  {
    name: "jobs-filter-panel",
    route: "/jobs",
    selector: "form.jobs-filter-panel",
    viewport: desktop,
    description: "Jobs listing filter controls",
  },
  {
    name: "jobs-card-first",
    route: "/jobs",
    selector: ".jobs-card",
    viewport: desktop,
    description: "First job result card",
  },
  {
    name: "job-detail-header",
    route: "/jobs/source-iskibris-garson",
    selector: ".job-detail-header",
    viewport: desktop,
    description: "Seeded job detail header",
  },
  {
    name: "job-detail-aside",
    route: "/jobs/source-iskibris-garson",
    selector: ".job-detail-aside",
    viewport: desktop,
    description: "Seeded job detail apply aside",
  },
  {
    name: "login-content",
    route: "/login",
    selector: "section.editorial-page-content",
    viewport: desktop,
    description: "Sign-in form and OAuth providers",
  },
  {
    name: "packages-catalog-grid",
    route: "/packages",
    selector: "ul.package-catalog-grid",
    viewport: desktop,
    description: "Package catalogue tiers",
  },
  {
    name: "not-found",
    route: "/qa-visual-not-found",
    selector: "main",
    viewport: desktop,
    description: "404 page for an unmatched route",
  },
];
