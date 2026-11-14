import { getAppBaseUrl } from "@/server/config/app-url";
import { buildLlmsBrief } from "@/content/ai-visibility/llms-brief";
import { computeLandingAvailability } from "@/features/jobs/landing-availability";
import { listPublicJobSitemapEntries } from "@/server/dal/jobs";

// Rendered per request, not cached, for the same reason the sitemap is: the
// brief advertises the district/type facet pages that currently hold at least
// one live vacancy, and a facet with none answers `noindex`. A cached copy would
// keep pointing an answer engine at a page the site tells crawlers to skip once
// the last vacancy of a facet is withdrawn. Crawler traffic is low, so the
// per-request read is acceptable.
export const dynamic = "force-dynamic";

/**
 * Plain-text brief for answer engines and AI crawlers (the llms.txt convention).
 * Served from the app origin so the URLs stay absolute and canonical. The facet
 * link list is filtered by the same availability projection the sitemap uses, so
 * the two cannot disagree about which landing pages are indexable.
 */
export async function GET() {
  const jobs = await listPublicJobSitemapEntries();
  const availability = computeLandingAvailability(jobs);
  const body = buildLlmsBrief(getAppBaseUrl(), availability);

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
