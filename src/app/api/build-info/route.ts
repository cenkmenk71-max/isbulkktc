export const dynamic = "force-static";

// Baked in at build time, so a response identifies exactly which commit this
// deployment was built from. Vercel exposes these variables to the build; the
// local dev server falls back to "unknown"/"development".
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const environment = process.env.VERCEL_ENV ?? "development";

/**
 * Machine-readable build identity. The post-deploy guard polls this endpoint
 * until the live site reports the commit that was just pushed, which is the
 * only way to prove the production alias is serving the new code rather than
 * silently sitting on the previous deployment.
 */
export function GET() {
  return Response.json(
    { commit, environment },
    { headers: { "Cache-Control": "no-store" } },
  );
}
