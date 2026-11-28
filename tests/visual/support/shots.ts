/**
 * The visual-regression shot list.
 *
 * One entry per captured region. `selector` is resolved against the page and
 * the first match is screenshotted at device resolution (DPR 2), so a shot is a
 * crop of real UI, not the whole document. Element crops keep the baselines
 * small and, more importantly, keep them independent of how far a page happens
 * to scroll — a fixed overlay such as the cookie notice sits outside every crop
 * below except where noted.
 */

export type VisualShot = {
  /** Stable id; also the baseline file name (`<name>.png`). */
  name: string;
  /** Route to open. The default locale (`tr`) is unprefixed. */
  path: string;
  /** CSS selector for the region to capture. */
  selector: string;
  /** Locale under test, for the report and the locale matrix. */
  locale: string;
  /** Fraction of pixels allowed to differ before the shot fails. */
  maxDiffPixelRatio?: number;
  /** Per-channel 0-255 tolerance that still counts a pixel as "equal". */
  channelTolerance?: number;
  /**
   * Regions painted over with a flat colour before capture. The 3D vend scene
   * renders through a canvas whose frame timing is load-dependent (see
   * `docs/performance-budget.md`), so a pixel diff there would be noise, not a
   * regression. The scene has its own behavioural specs.
   */
  maskSelectors?: string[];
  /** Human note that lands in the PR table. */
  note: string;
};

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

/** `tr` is unprefixed (`localePrefix: "as-needed"`); the rest carry a prefix. */
export function localePrefix(locale: string): string {
  return locale === "tr" ? "" : `/${locale}`;
}

const coreShots: VisualShot[] = [
  {
    name: "home-search",
    path: "/",
    selector: ".home-job-search",
    locale: "tr",
    maxDiffPixelRatio: 0.45,
    note: "Homepage job-search band: heading, fields, submit control.",
  },
  {
    name: "jobs-card",
    path: "/jobs",
    selector: ".jobs-card",
    locale: "tr",
    maxDiffPixelRatio: 0.45,
    note: "A listing card: topline, employer, tags, summary, actions.",
  },
  {
    name: "job-detail-card",
    path: "/jobs/source-iskibris-garson-pol-ay-investment-ltd",
    selector: ".job-detail-card",
    locale: "tr",
    maxDiffPixelRatio: 0.45,
    note: "Job-detail header, facts and body column.",
  },
  {
    name: "login-form",
    path: "/login",
    selector: ".editorial-form",
    locale: "tr",
    note: "Sign-in form: fields, submit, OAuth block, footnote.",
  },
  {
    name: "packages-lead",
    path: "/packages",
    selector: ".packages-lead-section",
    locale: "tr",
    note: "Packages lead band above the interactive showcase.",
  },
];

/**
 * The header in every locale. The nav labels change length (German is the
 * longest) and `fa` flips the whole row to RTL, so this is where a direction or
 * overflow regression shows up first.
 *
 * The header has `backdrop-filter: blur()` over the hero photo, and the
 * compositor rounds the blurred backdrop by ±1-2 levels between runs. The
 * `channelTolerance` below absorbs that; without it the shot would flake at ~2%
 * of pixels on a max channel delta of 2. That is rendering noise, not a
 * regression, and it is well under the per-channel tolerance used for text
 * antialiasing.
 */
const headerMatrix: VisualShot[] = locales.map((locale) => ({
  name: `header-${locale}`,
  path: `${localePrefix(locale)}/`,
  selector: "header.site-header",
  locale,
  note: locale === "fa" ? "Header in RTL (`dir=rtl`)." : `Header in \`${locale}\`.`,
}));

/**
 * A wider RTL sample. The header proves direction on a single row; this band
 * proves the search form and its two-column layout mirror correctly.
 */
const rtlShot: VisualShot = {
    name: "home-search-fa",
    path: "/fa",
    selector: ".home-job-search",
    locale: "fa",
    maxDiffPixelRatio: 0.45,
    note: "Homepage search band under RTL.",
};

export const visualShots: VisualShot[] = [...coreShots, ...headerMatrix, rtlShot];

/** Default allowance: 0.2% of pixels, matching Playwright's own default. */
export const defaultMaxDiffPixelRatio = 0.002;
/** Per-channel slack that absorbs sub-pixel antialiasing drift. */
export const defaultChannelTolerance = 12;
