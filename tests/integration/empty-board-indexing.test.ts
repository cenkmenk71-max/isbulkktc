import assert from "node:assert/strict";
import test, { mock } from "node:test";

/**
 * The empty job board must not be indexed.
 *
 * `/jobs` renders a 200 with `index, follow` even when it holds no vacancy, and
 * the sitemap advertised it unconditionally. That is a Soft 404: a page whose
 * only content is "0 ilan" competes in the index with the pages that do have
 * content, and it is the exact contradiction the district/type landings already
 * avoid (they answer `noindex` when their filter matches nothing). The two
 * defects this pins:
 *
 *  - `generateMetadata` on `/jobs` returned `index, follow` for an empty board;
 *  - `sitemap.xml` listed `/jobs` while it answered `noindex`.
 *
 * Both fixes are asserted through the real route bodies. Only the vacancy
 * projection is faked, because the unit layer cannot install module mocks and
 * the real RPC needs a live database.
 */

mock.module("server-only", { namedExports: {} });

type Projection = {
  slug: string;
  publishedAt: string;
  modifiedAt: string;
  district: string | null;
  jobType: string;
};

let sitemapJobs: Projection[] = [];
let boardTotal = 0;

mock.module("@/server/dal/jobs", {
  namedExports: {
    listPublicJobSitemapEntries: async () => sitemapJobs,
    searchPublicJobs: async () => ({
      jobs: [],
      total: boardTotal,
      page: 1,
      pageSize: 20,
    }),
  },
});

// The page module reaches `next/navigation` through next-intl's navigation
// helpers, which import `permanentRedirect` and the client hooks as well as
// `redirect`; the shared harness only provides `redirect`, so the full surface
// the import chain touches is declared here.
mock.module("next/navigation", {
  namedExports: {
    notFound: (): never => {
      throw new Error("notFound");
    },
    redirect: (destination: string): never => {
      throw new Error(`redirect:${destination}`);
    },
    permanentRedirect: (destination: string): never => {
      throw new Error(`permanentRedirect:${destination}`);
    },
    usePathname: () => "/jobs",
    useRouter: () => ({
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    }),
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  },
});

// `getTranslations` returns a translator; the assertions only read the metadata
// `robots` field, so the message text is irrelevant. `setRequestLocale` is a
// no-op outside a request scope.
mock.module("next-intl/server", {
  namedExports: {
    getLocale: async () => "tr",
    getTranslations: async () => (key: string) => key,
    setRequestLocale: () => {},
  },
});

const sitemapRoute = () => import("@/app/sitemap");
const jobsPage = () => import("@/app/[locale]/(public)/jobs/page");

test("the sitemap drops /jobs while the board is empty", async () => {
  sitemapJobs = [];
  const { default: sitemap } = await sitemapRoute();

  const locs = (await sitemap()).map((entry) => entry.url);

  assert.ok(
    !locs.some((loc) => /\/jobs$/.test(loc)),
    "an empty /jobs answers noindex, so a sitemap entry for it is a contradiction",
  );
  // The pages that are not the board must survive the filter untouched.
  assert.ok(
    locs.some((loc) => /\/$/.test(loc)),
    "the homepage must stay advertised when the board is empty",
  );
});

test("the sitemap advertises /jobs once a vacancy exists", async () => {
  sitemapJobs = [
    {
      slug: "ornek-ilan",
      publishedAt: "2026-11-01T00:00:00.000Z",
      modifiedAt: "2026-11-02T00:00:00.000Z",
      district: "Lefkoşa",
      jobType: "full_time",
    },
  ];
  const { default: sitemap } = await sitemapRoute();

  const locs = (await sitemap()).map((entry) => entry.url);

  assert.ok(
    locs.some((loc) => /\/jobs$/.test(loc)),
    "a non-empty board is indexable and must be listed again",
  );
});

test("generateMetadata marks the empty board noindex", async () => {
  boardTotal = 0;
  const { generateMetadata } = await jobsPage();

  const metadata = await generateMetadata({
    params: Promise.resolve({ locale: "tr" }),
    searchParams: Promise.resolve({}),
  });

  assert.equal(
    (metadata.robots as { index?: boolean } | undefined)?.index,
    false,
    "an empty board answered index,follow — the soft 404 this guard removes",
  );
});

test("generateMetadata keeps a non-empty board indexable", async () => {
  boardTotal = 1;
  const { generateMetadata } = await jobsPage();

  const metadata = await generateMetadata({
    params: Promise.resolve({ locale: "tr" }),
    searchParams: Promise.resolve({}),
  });

  assert.notEqual(
    (metadata.robots as { index?: boolean } | undefined)?.index,
    false,
    "a board with a vacancy must stay indexable",
  );
});
