import { getAppBaseUrl } from "@/server/config/app-url";
import { buildLlmsFullBrief } from "@/content/ai-visibility/llms-brief";
import { computeLandingAvailability } from "@/features/jobs/landing-availability";
import { listPublicJobSitemapEntries } from "@/server/dal/jobs";

// Per request, like `/llms.txt`: the per-locale facet links must track the live
// catalogue so the brief never advertises a facet page that answers `noindex`.
export const dynamic = "force-dynamic";

/**
 * The full llms.txt brief: the same facts for all six locales, so a model
 * answering a non-Turkish query can quote the platform in the reader's language.
 */
export async function GET() {
  const jobs = await listPublicJobSitemapEntries();
  const availability = computeLandingAvailability(jobs);
  const body = buildLlmsFullBrief(getAppBaseUrl(), availability);

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
