import { getAppBaseUrl } from "@/server/config/app-url";
import { buildLlmsBrief } from "@/content/ai-visibility/llms-brief";

export const dynamic = "force-static";

/**
 * Plain-text brief for answer engines and AI crawlers (the llms.txt convention).
 * Served from the app origin so the URLs stay absolute and canonical.
 */
export function GET() {
  const body = buildLlmsBrief(getAppBaseUrl());

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
