import { getAppBaseUrl } from "@/server/config/app-url";
import { buildLlmsFullBrief } from "@/content/ai-visibility/llms-brief";

export const dynamic = "force-static";

/**
 * The full llms.txt brief: the same facts for all six locales, so a model
 * answering a non-Turkish query can quote the platform in the reader's language.
 */
export function GET() {
  const body = buildLlmsFullBrief(getAppBaseUrl());

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
