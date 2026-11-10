import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { getArticles } from "@/content/editorial";
import { getGuides } from "@/content/guides";
import { districtSlug } from "@/features/locations/northern-cyprus-districts";
import { jobTypeSlugs } from "@/features/jobs/job-type-slugs";

/**
 * A design that is only checked by eye regresses silently: a colour tweak can
 * drop a label below AA, a smaller control can lose its touch target, or a
 * heading can skip a level. axe-core runs the same rules a manual accessibility
 * audit would, on every locale, so a "micro" visual change cannot ship a
 * regression that nobody notices.
 *
 * One test per (locale, viewport, route) rather than one per locale. Playwright
 * shards by test, so a single test that walked all ~26 pages pinned a whole
 * shard to roughly nine minutes while the others finished in five (issue #95).
 * The page-level split leaves the coverage identical — same locales, same
 * routes, same axe tags, same settle — but gives the shard planner uniformly
 * sized tests to spread across the four shards.
 *
 * The route list covers every public route family, including the six that were
 * added after this guard first shipped (`/sss`, `/rehber` and `/rehber/[slug]`,
 * `/blog/[slug]`, `/is-ilanlari/[district]`, `/is-turleri/[type]`). They were
 * only ever probed by hand; without a test here a later tweak to the FAQ
 * accordion, the guide CTA row or the district cross-links would regress with
 * nobody watching.
 */

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

const publicRoutes = [
  { path: "/", name: "home" },
  { path: "/jobs", name: "jobs" },
  { path: "/companies", name: "companies" },
  { path: "/freelance", name: "freelance" },
  { path: "/packages", name: "packages" },
  { path: "/about", name: "about" },
  { path: "/blog", name: "blog" },
  { path: "/rehber", name: "rehber" },
  { path: "/sss", name: "sss" },
  { path: "/contact", name: "contact" },
  { path: "/login", name: "login" },
  { path: "/register", name: "register" },
  // The two account-recovery routes. They are the first pages a locked-out
  // visitor reaches, yet they were the only auth routes missing from the guard.
  // `/forgot-password` renders the request form. `/reset-password` sends an
  // unauthenticated visitor to `/forgot-password?error=expired`, so the audit
  // runs against that redirect target — the only state reachable without a
  // recovery session. Keeping the entry means the guard still fails loudly if
  // that redirect ever breaks and an unauthenticated new-password form starts
  // rendering at `/reset-password`.
  { path: "/forgot-password", name: "forgot-password" },
  { path: "/reset-password", name: "reset-password" },
  // The PWA install landing page is a real public route reached by scanning a
  // QR code, so it is held to the same standard as the rest of the site.
  { path: "/install", name: "install" },
  { path: "/privacy", name: "privacy" },
  { path: "/cookies", name: "cookies" },
  { path: "/terms", name: "terms" },
  // District and job-type landing pages share `JobsExperience` with `/jobs`, but
  // each adds a cross-link block the plain listing does not render. Their slugs
  // are the same under every locale prefix (the pages canonicalise to the
  // default locale), so a single slug per family covers all six.
  { path: `/is-ilanlari/${districtSlug("Girne")}`, name: "district" },
  { path: `/is-turleri/${jobTypeSlugs.full_time}`, name: "job-type" },
  // A job detail page. Imported listings carry one Turkish slug under every
  // prefix (they canonicalise to the default locale), so one seeded slug covers
  // all six. The route renders the employer card, the fact row and — for a
  // `platform` listing — the application form, none of which `/jobs` shows, so
  // it is a distinct layout the guard has to reach. The slug is the same one
  // `jobs.spec.ts` and `seo.spec.ts` already rely on.
  { path: "/jobs/source-iskibris-garson", name: "job-detail" },
] as const;

/**
 * The translated-slug detail routes. Guides and articles carry a different slug
 * per locale (`kktc-is-bulma-rehberi` vs `finding-a-job-in-northern-cyprus`), so
 * the path has to be built from each locale's own content rather than reused
 * across prefixes. The first entry of each family is audited: it renders the
 * same template as its siblings, so the extra pages add runtime without adding a
 * distinct layout to check.
 */
function detailRoutesFor(locale: (typeof locales)[number]) {
  return [
    { path: `/rehber/${getGuides(locale)[0].slug}`, name: "rehber-detail" },
    { path: `/blog/${getArticles(locale)[0].slug}`, name: "blog-detail" },
  ];
}

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

// Desktop layout is shared across locales, so auditing it in every language
// would only re-run the same rules. German has the longest strings, Persian is
// the RTL reference, and Turkish is the default: those three cover the layout
// risks. Every locale is still audited at mobile width, where the routes differ
// most.
const desktopLocales = new Set(["tr", "de", "fa"]);

function localePrefix(locale: string): string {
  return locale === "tr" ? "" : `/${locale}`;
}

for (const locale of locales) {
  const activeViewports = desktopLocales.has(locale)
    ? viewports
    : [viewports[0]];
  const routes = [...publicRoutes, ...detailRoutesFor(locale)];

  for (const viewport of activeViewports) {
    for (const route of routes) {
      test(`axe finds no accessibility violations in ${locale} ${viewport.name} ${route.name}`, async ({
        page,
      }) => {
        // Animated hero scenes settle late and software WebGL in CI is slow.
        // 120s matches the project's convention for the 3D-heavy routes; it is
        // per route now, so a slow page cannot borrow time from a fast one.
        test.setTimeout(120_000);
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        await page.goto(`${localePrefix(locale)}${route.path}`, {
          waitUntil: "domcontentloaded",
        });
        // Animated hero scenes settle late; auditing mid-animation produces
        // transient contrast findings that are not real.
        await page.waitForTimeout(600);
        // The consent card is a client component, so it mounts only after
        // hydration and then plays a short entrance animation. If that animation
        // is still running, axe measures the card's text at partial opacity and
        // reports a color-contrast violation that no settled user ever sees.
        // Wait for finite animations to finish (bounded, and ignoring looping
        // ones such as the hero rays) so the audit reflects the resting state.
        await page
          .waitForFunction(
            () =>
              document
                .getAnimations()
                .filter((animation) => animation.playState === "running")
                .every((animation) => {
                  const timing = animation.effect?.getComputedTiming?.();
                  return timing?.iterations === Infinity;
                }),
            undefined,
            { timeout: 3000 },
          )
          .catch(() => {});

        const results = await new AxeBuilder({ page })
          // wcag22aa adds the 2.2 success criteria axe can automate, notably
          // target-size (2.5.8): a control must be at least 24x24 CSS px or
          // spaced so an undersized one is not the only target.
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();

        const violations = results.violations.map((violation) => {
          const nodes = violation.nodes
            .slice(0, 2)
            .map((node) => node.target.join(" "))
            .join(", ");
          return `${locale}${route.path} @${viewport.name}: [${violation.id}] ${violation.help} -> ${nodes}`;
        });

        expect(
          violations,
          `Accessibility violations found:\n${violations.join("\n")}`,
        ).toEqual([]);
      });
    }
  }
}
